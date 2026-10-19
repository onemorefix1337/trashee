import { is } from '@electron-toolkit/utils'
import { BrowserWindow, app, ipcMain, systemPreferences } from 'electron'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import {
  INITIAL_VOICE_MODEL,
  VOICE_MODEL,
  type VoiceEvent,
  type VoiceModelState
} from '../shared/voice'

const PROGRESS_INTERVAL_MS = 150

/** Where the model comes from; a test can point it elsewhere. */
const modelUrl = (): string => process.env.TRASHEE_VOICE_MODEL_URL || VOICE_MODEL.url

const modelDir = (): string => join(app.getPath('userData'), 'voice')
const modelFile = (): string => join(modelDir(), VOICE_MODEL.file)

let state: VoiceModelState = { ...INITIAL_VOICE_MODEL }
let download: AbortController | null = null

/**
 * Voice control needs a speech model of about 45 MB. It is not in the installer: it comes once, from the
 * project's own releases, when the user turns voice control on, and its checksum has to match.
 */
export function registerVoice(playerWindow: () => BrowserWindow | null): void {
  const fromPlayer = (sender: Electron.WebContents): boolean => {
    const window = playerWindow()
    return !!window && !window.isDestroyed() && sender === window.webContents
  }
  const publish = (patch: Partial<VoiceModelState>): void => {
    state = { ...state, ...patch }
    const window = playerWindow()
    if (window && !window.isDestroyed()) window.webContents.send('voice:state', state)
  }

  if (existsSync(modelFile())) state = { ...state, status: 'ready', received: VOICE_MODEL.size }

  async function fetchModel(signal: AbortSignal): Promise<void> {
    mkdirSync(modelDir(), { recursive: true })
    const response = await fetch(modelUrl(), { signal })
    if (!response.ok || !response.body) throw new Error(`Сервер ответил ${response.status}`)
    const total = Number(response.headers.get('content-length')) || VOICE_MODEL.size
    publish({ status: 'downloading', received: 0, total, error: null })

    const hash = createHash('sha256')
    let received = 0
    let lastReport = 0
    const source = Readable.fromWeb(response.body as unknown as WebReadableStream)
    source.on('data', (chunk: Buffer) => {
      hash.update(chunk)
      received += chunk.length
      const now = Date.now()
      if (now - lastReport >= PROGRESS_INTERVAL_MS) {
        lastReport = now
        publish({ received })
      }
    })
    const partial = `${modelFile()}.part`
    try {
      await pipeline(source, createWriteStream(partial), { signal })
      if (VOICE_MODEL.sha256 && hash.digest('hex') !== VOICE_MODEL.sha256) {
        throw new Error('Скачанный файл не совпал с контрольной суммой')
      }
      renameSync(partial, modelFile())
    } catch (error) {
      rmSync(partial, { force: true })
      throw error
    }
  }

  async function startDownload(): Promise<VoiceModelState> {
    if (state.status === 'ready' || state.status === 'downloading') return state
    const controller = new AbortController()
    download = controller
    try {
      await fetchModel(controller.signal)
      publish({ status: 'ready', received: state.total, error: null })
    } catch (error) {
      if (controller.signal.aborted) publish({ status: 'missing', received: 0, error: null })
      else
        publish({
          status: 'error',
          error: error instanceof Error ? error.message : 'Не удалось скачать модель'
        })
    } finally {
      download = null
    }
    return state
  }

  ipcMain.handle('voice:state', (event) => (fromPlayer(event.sender) ? state : undefined))
  ipcMain.handle('voice:download', (event) =>
    fromPlayer(event.sender) ? startDownload() : undefined
  )
  ipcMain.handle('voice:cancel', (event) => {
    if (fromPlayer(event.sender)) download?.abort()
  })
  ipcMain.handle('voice:remove', (event) => {
    if (!fromPlayer(event.sender) || state.status === 'downloading') return state
    rmSync(modelFile(), { force: true })
    publish({ status: 'missing', received: 0, error: null })
    return state
  })
  // The microphone is listened to in a window of its own, one that shows nothing and has the looser security
  // policy the recognizer needs; the player window only gets the words it heard.
  let listener: BrowserWindow | null = null

  const closeListener = (): void => {
    const closing = listener
    listener = null
    if (closing && !closing.isDestroyed()) closing.destroy()
  }

  const fromListener = (sender: Electron.WebContents): boolean =>
    !!listener && !listener.isDestroyed() && sender === listener.webContents

  const sendEvent = (event: VoiceEvent): void => {
    const window = playerWindow()
    if (window && !window.isDestroyed()) window.webContents.send('voice:event', event)
  }

  /** True when the microphone may be used; on macOS this is where the system asks. */
  async function microphoneAllowed(): Promise<boolean> {
    if (process.platform !== 'darwin') return true
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') return true
    if (status === 'denied' || status === 'restricted') return false
    return systemPreferences.askForMediaAccess('microphone')
  }

  function openListener(): void {
    closeListener()
    const created = new BrowserWindow({
      show: false,
      width: 120,
      height: 80,
      skipTaskbar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/voice.js'),
        // A hidden page must not be slowed down: the recognizer runs on a timer-free audio thread, but be safe.
        backgroundThrottling: false
      }
    })
    listener = created
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    created.webContents.on('will-navigate', (event) => event.preventDefault())
    created.on('closed', () => {
      if (listener === created) {
        listener = null
        sendEvent({ kind: 'error', message: 'Распознавание остановилось' })
      }
    })
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void created.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/voice.html`)
    } else {
      void created.loadFile(join(__dirname, '../renderer/voice.html'))
    }
  }

  /** Starts or stops listening. Resolves to an explanation when the microphone is not allowed. */
  ipcMain.handle('voice:listen', async (event, on: unknown) => {
    if (!fromPlayer(event.sender)) return { ok: false, error: 'Нельзя' }
    if (on !== true) {
      closeListener()
      return { ok: true }
    }
    if (state.status !== 'ready') return { ok: false, error: 'Модель не скачана' }
    if (!(await microphoneAllowed())) {
      return {
        ok: false,
        error: 'Нет доступа к микрофону. Разреши его для trashee в настройках системы.'
      }
    }
    openListener()
    return { ok: true }
  })
  /** The model's bytes, for the recognizer in the listening window. */
  ipcMain.handle('voice:model', (event) => {
    if (!fromListener(event.sender) || state.status !== 'ready') return null
    return readFileSync(modelFile())
  })
  ipcMain.on('voice:report', (event, report: VoiceEvent) => {
    if (fromListener(event.sender)) sendEvent(report)
  })
  app.on('before-quit', closeListener)
}
