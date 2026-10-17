import { clipboard, ipcMain, shell } from 'electron'
import { OAuthError, pollDeviceToken, requestDeviceCode } from './yandex/auth'
import { YandexMusic } from './yandex/client'
import { isAuthFailure } from './yandex/errors'
import { TrackStreamer } from './yandex/stream'
import type { Account, CollectionRef, Quality, Restore, WaveEvent } from '../shared/types'
import { clearToken, loadToken, saveToken } from './store'

const RESTORE_ATTEMPTS = 3
const RESTORE_RETRY_MS = 2000

let api: YandexMusic | null = null
let loginCancelled = false

export const streamer = new TrackStreamer(() => api)

function requireApi(): YandexMusic {
  if (!api) throw new Error('Не выполнен вход')
  return api
}

async function signIn(token: string): Promise<Account> {
  const candidate = new YandexMusic(token)
  const account = await candidate.account()
  api = candidate
  return account
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** One poll that treats network trouble like "not confirmed yet"; real OAuth failures still throw. */
async function pollOnce(deviceCode: string): Promise<string | null> {
  try {
    return await pollDeviceToken(deviceCode)
  } catch (error) {
    if (error instanceof OAuthError) throw error
    return null
  }
}

export function registerIpc(): void {
  ipcMain.handle('auth:restore', async (): Promise<Restore> => {
    const token = loadToken()
    if (!token) return { status: 'login' }
    for (let attempt = 1; ; attempt++) {
      try {
        return { status: 'ok', account: await signIn(token) }
      } catch (error) {
        // Only a rejected token is forgotten; a flaky network must not log the user out.
        if (isAuthFailure(error)) {
          clearToken()
          return { status: 'login' }
        }
        if (attempt >= RESTORE_ATTEMPTS) return { status: 'offline' }
        await sleep(RESTORE_RETRY_MS)
      }
    }
  })

  ipcMain.handle('auth:login', async (event): Promise<Account> => {
    loginCancelled = false
    const code = await requestDeviceCode()
    event.sender.send('auth:code', code)
    shell.openExternal(code.verificationUrl)

    const deadline = Date.now() + code.expiresIn * 1000
    while (Date.now() < deadline) {
      if (loginCancelled) throw new Error('Вход отменён')
      await sleep(code.interval * 1000)
      const token = await pollOnce(code.deviceCode)
      if (token) {
        // Saved before the first API call, so a network hiccup right now does not cost another code.
        try {
          saveToken(token)
        } catch (error) {
          console.error('Could not save the token:', error)
        }
        return signIn(token)
      }
    }
    throw new Error('Время подтверждения истекло')
  })

  ipcMain.handle('app:copy', (_, text: unknown) => {
    if (typeof text === 'string') clipboard.writeText(text)
  })

  ipcMain.handle('auth:cancel', () => {
    loginCancelled = true
  })

  ipcMain.handle('auth:logout', () => {
    api = null
    clearToken()
  })

  ipcMain.handle('ym:search', (_, text: string) => requireApi().search(text))
  ipcMain.handle('ym:liked', () => requireApi().likedTracks())
  ipcMain.handle('ym:liked-ids', () => requireApi().likedIds())
  ipcMain.handle('ym:set-dislike', (_, id: string, disliked: boolean) =>
    requireApi().setDislike(id, disliked)
  )
  ipcMain.handle('ym:lyrics', (_, id: string) => requireApi().lyrics(id))
  ipcMain.handle('ym:set-like', (_, id: string, liked: boolean) => requireApi().setLike(id, liked))
  ipcMain.handle('ym:similar', (_, id: string) => requireApi().similar(id))
  ipcMain.handle('ym:pins', () => requireApi().pins())
  ipcMain.handle('ym:playlists', () => requireApi().playlists())
  ipcMain.handle('ym:collection', (_, ref: CollectionRef) => requireApi().collection(ref))
  ipcMain.handle('ym:set-pin', (_, ref: CollectionRef, pinned: boolean) =>
    requireApi().setPin(ref, pinned)
  )
  ipcMain.handle('ym:wave-start', (_, seed?: string) => requireApi().waveStart(seed))
  ipcMain.handle('ym:wave-next', (_, sessionId: string, lastTrackId: string) =>
    requireApi().waveNext(sessionId, lastTrackId)
  )
  ipcMain.handle(
    'ym:wave-feedback',
    (
      _,
      sessionId: string,
      batchId: string,
      type: WaveEvent,
      trackId?: string,
      playedSeconds?: number
    ) =>
      // Feedback only tunes recommendations; a flaky network must not surface as an error.
      requireApi()
        .waveFeedback(sessionId, batchId, type, trackId, playedSeconds)
        .catch(() => undefined)
  )
  ipcMain.handle('settings:set-quality', (_, quality: Quality) => {
    streamer.quality = quality
  })
}
