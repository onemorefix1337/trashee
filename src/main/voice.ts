import { is } from '@electron-toolkit/utils'
import { BrowserWindow, app, ipcMain, systemPreferences } from 'electron'
import { createHash } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import {
  VOICE_MODELS,
  initialModelState,
  modelSize,
  sanitizeProfile,
  type SpeakerProfile,
  type VoiceConfig,
  type VoiceEvent,
  type VoiceModelKind,
  type VoiceModels,
  type VoiceModelState
} from '../shared/voice'

const PROGRESS_INTERVAL_MS = 150
const KINDS: VoiceModelKind[] = ['speech', 'speaker']

const voiceDir = (): string => join(app.getPath('userData'), 'voice')
const fileOf = (name: string): string => join(voiceDir(), name)
const profileFile = (): string => join(voiceDir(), 'profile.json')

/** Where a file comes from; a test can point the downloads at another server (the same file names). */
function urlOf(url: string, file: string): string {
  const base = process.env.TRASHEE_VOICE_MODELS_URL
  return base ? `${base.replace(/\/$/, '')}/${file}` : url
}

const isComplete = (kind: VoiceModelKind): boolean =>
  VOICE_MODELS[kind].every((spec) => existsSync(fileOf(spec.file)))

let models: VoiceModels = {
  speech: initialModelState('speech'),
  speaker: initialModelState('speaker')
}
const downloads: Partial<Record<VoiceModelKind, AbortController>> = {}

/**
 * Voice control downloads what it needs instead of carrying it in the installer: the speech model (about 45 MB)
 * when it is turned on, and the voice model with its runtime (about 40 MB) when "only my voice" is. Each file
 * comes from the project's own releases and has to match its checksum.
 */
export function registerVoice(playerWindow: () => BrowserWindow | null): void {
  const fromPlayer = (sender: Electron.WebContents): boolean => {
    const window = playerWindow()
    return !!window && !window.isDestroyed() && sender === window.webContents
  }
  const toPlayer = (channel: string, payload: unknown): void => {
    const window = playerWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }
  const publish = (kind: VoiceModelKind, patch: Partial<VoiceModelState>): void => {
    models = { ...models, [kind]: { ...models[kind], ...patch } }
    toPlayer('voice:state', models)
  }

  for (const kind of KINDS) {
    if (isComplete(kind))
      models[kind] = { ...models[kind], status: 'ready', received: modelSize(kind) }
  }

  async function fetchFile(
    kind: VoiceModelKind,
    index: number,
    done: number,
    signal: AbortSignal
  ): Promise<number> {
    const spec = VOICE_MODELS[kind][index]
    const target = fileOf(spec.file)
    if (existsSync(target)) return done + spec.size
    const response = await fetch(urlOf(spec.url, spec.file), { signal })
    if (!response.ok || !response.body) throw new Error(`Сервер ответил ${response.status}`)

    const hash = createHash('sha256')
    let received = done
    let lastReport = 0
    const source = Readable.fromWeb(response.body as unknown as WebReadableStream)
    source.on('data', (chunk: Buffer) => {
      hash.update(chunk)
      received += chunk.length
      const now = Date.now()
      if (now - lastReport >= PROGRESS_INTERVAL_MS) {
        lastReport = now
        publish(kind, { received })
      }
    })
    const partial = `${target}.part`
    try {
      await pipeline(source, createWriteStream(partial), { signal })
      if (hash.digest('hex') !== spec.sha256) {
        throw new Error('Скачанный файл не совпал с контрольной суммой')
      }
      renameSync(partial, target)
    } catch (error) {
      rmSync(partial, { force: true })
      throw error
    }
    return done + spec.size
  }

  async function startDownload(kind: VoiceModelKind): Promise<VoiceModelState> {
    const current = models[kind]
    if (current.status === 'ready' || current.status === 'downloading') return current
    const controller = new AbortController()
    downloads[kind] = controller
    publish(kind, { status: 'downloading', received: 0, total: modelSize(kind), error: null })
    try {
      mkdirSync(voiceDir(), { recursive: true })
      let done = 0
      for (let index = 0; index < VOICE_MODELS[kind].length; index++) {
        done = await fetchFile(kind, index, done, controller.signal)
        publish(kind, { received: done })
      }
      publish(kind, { status: 'ready', received: modelSize(kind), error: null })
    } catch (error) {
      if (controller.signal.aborted) publish(kind, { status: 'missing', received: 0, error: null })
      else
        publish(kind, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Не удалось скачать модель'
        })
    } finally {
      delete downloads[kind]
    }
    return models[kind]
  }

  const kindOf = (value: unknown): VoiceModelKind | null =>
    value === 'speech' || value === 'speaker' ? value : null

  ipcMain.handle('voice:state', (event) => (fromPlayer(event.sender) ? models : undefined))
  ipcMain.handle('voice:download', (event, value: unknown) => {
    const kind = kindOf(value)
    return fromPlayer(event.sender) && kind ? startDownload(kind) : undefined
  })
  ipcMain.handle('voice:cancel', (event, value: unknown) => {
    const kind = kindOf(value)
    if (fromPlayer(event.sender) && kind) downloads[kind]?.abort()
  })
  ipcMain.handle('voice:remove', (event, value: unknown) => {
    const kind = kindOf(value)
    if (!fromPlayer(event.sender) || !kind || models[kind].status === 'downloading') return models
    for (const spec of VOICE_MODELS[kind]) rmSync(fileOf(spec.file), { force: true })
    publish(kind, { status: 'missing', received: 0, error: null })
    return models
  })

  /* ---------- the user's voice ---------- */

  const readProfile = (): SpeakerProfile | null => {
    try {
      return sanitizeProfile(JSON.parse(readFileSync(profileFile(), 'utf8')))
    } catch {
      return null
    }
  }
  ipcMain.handle('voice:profile', (event) => (fromPlayer(event.sender) ? readProfile() : null))
  ipcMain.handle('voice:save-profile', (event, raw: unknown) => {
    const profile = sanitizeProfile(raw)
    if (!fromPlayer(event.sender) || !profile) return null
    mkdirSync(voiceDir(), { recursive: true })
    writeFileSync(profileFile(), JSON.stringify(profile))
    return profile
  })
  ipcMain.handle('voice:delete-profile', (event) => {
    if (fromPlayer(event.sender)) rmSync(profileFile(), { force: true })
  })

  /* ---------- the listening window ---------- */

  // The microphone is listened to in a window of its own, one that shows nothing and has the looser security
  // policy the recognizer needs; the player window only gets the words it heard.
  let listener: BrowserWindow | null = null
  let config: VoiceConfig | null = null

  const closeListener = (): void => {
    const closing = listener
    listener = null
    if (closing && !closing.isDestroyed()) closing.destroy()
  }

  const fromListener = (sender: Electron.WebContents): boolean =>
    !!listener && !listener.isDestroyed() && sender === listener.webContents

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
        // A hidden page must not be slowed down.
        backgroundThrottling: false
      }
    })
    listener = created
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    created.webContents.on('will-navigate', (event) => event.preventDefault())
    created.on('closed', () => {
      if (listener === created) {
        listener = null
        toPlayer('voice:event', { kind: 'error', message: 'Распознавание остановилось' })
      }
    })
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void created.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/voice.html`)
    } else {
      void created.loadFile(join(__dirname, '../renderer/voice.html'))
    }
  }

  /** Starts or stops listening. Resolves to an explanation when the microphone is not allowed. */
  ipcMain.handle('voice:listen', async (event, on: unknown, next: unknown) => {
    if (!fromPlayer(event.sender)) return { ok: false, error: 'Нельзя' }
    if (on !== true) {
      closeListener()
      return { ok: true }
    }
    if (models.speech.status !== 'ready') return { ok: false, error: 'Модель не скачана' }
    if (!(await microphoneAllowed())) {
      return {
        ok: false,
        error: 'Нет доступа к микрофону. Разреши его для trashee в настройках системы.'
      }
    }
    config = next as VoiceConfig
    openListener()
    return { ok: true }
  })
  /** The settings changed while listening: the listening window adapts without starting over. */
  ipcMain.on('voice:config', (event, next: VoiceConfig) => {
    if (!fromPlayer(event.sender)) return
    config = next
    if (listener && !listener.isDestroyed()) listener.webContents.send('voice:config', next)
  })

  ipcMain.handle('voice:get-config', (event) => (fromListener(event.sender) ? config : null))
  /** The speech model's bytes, for the recognizer in the listening window. */
  ipcMain.handle('voice:model', (event) => {
    if (!fromListener(event.sender) || models.speech.status !== 'ready') return null
    return readFileSync(fileOf(VOICE_MODELS.speech[0].file))
  })
  /** The voice model and its runtime, when they are downloaded. */
  ipcMain.handle('voice:speaker-pack', (event) => {
    if (!fromListener(event.sender) || models.speaker.status !== 'ready') return null
    const [model, runtime] = VOICE_MODELS.speaker.map((spec) => readFileSync(fileOf(spec.file)))
    return { model, runtime }
  })
  ipcMain.on('voice:report', (event, report: VoiceEvent) => {
    if (fromListener(event.sender)) toPlayer('voice:event', report)
  })
  app.on('before-quit', closeListener)
}
