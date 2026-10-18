import { app, clipboard, ipcMain, shell, type BrowserWindow } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { OAuthError, pollDeviceToken, requestDeviceCode } from './yandex/auth'
import { YandexMusic } from './yandex/client'
import { isAuthFailure } from './yandex/errors'
import { TrackStreamer } from './yandex/stream'
import { resolveLyrics } from '../shared/lyrics-resolve'
import { sanitizeLyricsQuery } from '../shared/lyrics-query'
import { refKey } from '../shared/collections'
import type {
  Account,
  CacheInfo,
  CollectionRef,
  Lyrics,
  LyricsQuery,
  OfflineState,
  Quality,
  Restore,
  Track,
  WaveEvent
} from '../shared/types'
import { TrackCache, safeFileName } from './yandex/cache.ts'
import { OfflineLibrary } from './yandex/offline.ts'
import { OPEN_SOURCES } from './lyrics/open-sources'
import { clearToken, loadToken, saveToken } from './store'

const STREAM_CACHE_LIMIT = 400 * 1024 * 1024
const LIKED_OFFLINE_LIMIT = 500

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

const PLAYLIST_TITLE_LIMIT = 100

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

let offline: OfflineLibrary | null = null

/** A cover the user saved for offline listening, if there is one; the protocol handler asks before going online. */
export function offlineCover(uri: string, size: string): { file: string; type: string } | null {
  return offline?.coverFile(uri, size) ?? null
}

export function registerIpc(getPlayerWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown): void => {
    const window = getPlayerWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }

  const cacheRoot = join(app.getPath('userData'), 'cache')
  const files = new TrackCache(cacheRoot, {
    streamLimit: STREAM_CACHE_LIMIT,
    resolve: (id, quality) => streamer.sourceFor(id, quality)
  })
  streamer.attachFiles(files)

  const lyricsFor = (query: LyricsQuery): Promise<Lyrics> =>
    resolveLyrics(query, () => requireApi().lyrics(query.id), OPEN_SOURCES)
  const trackQuery = (track: Track): LyricsQuery => ({
    id: track.id,
    title: track.title,
    artists: track.artists.map((artist) => artist.name),
    album: track.albums[0]?.title,
    durationSec: track.durationMs / 1000
  })
  const library = new OfflineLibrary(cacheRoot, {
    cache: files,
    quality: () => streamer.quality,
    lyrics: (track) => lyricsFor(trackQuery(track)),
    emit: (state: OfflineState) => send('offline:state', state)
  })
  offline = library

  ipcMain.handle('auth:restore', async (): Promise<Restore> => {
    const token = loadToken()
    if (!token) return { status: 'login' }
    // With something saved there is a reason to open the app without a connection, so do not make the user wait.
    const attempts = library.list().length > 0 ? 1 : RESTORE_ATTEMPTS
    for (let attempt = 1; ; attempt++) {
      try {
        return { status: 'ok', account: await signIn(token) }
      } catch (error) {
        // Only a rejected token is forgotten; a flaky network must not log the user out.
        if (isAuthFailure(error)) {
          clearToken()
          return { status: 'login' }
        }
        if (attempt >= attempts) {
          // Saved collections and their lyrics and covers work without Yandex; the rest waits for the network.
          return library.list().length > 0
            ? {
                status: 'ok',
                account: { uid: 0, login: 'Без сети', hasPlus: false },
                offline: true
              }
            : { status: 'offline' }
        }
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
  ipcMain.handle('ym:liked', async () => {
    try {
      return await requireApi().likedTracks()
    } catch (error) {
      // Offline: the saved copy of the liked tracks, if there is one.
      const saved = library.get('liked')
      if (saved && !isAuthFailure(error)) return saved.tracks
      throw error
    }
  })
  ipcMain.handle('ym:liked-ids', () => requireApi().likedIds())
  ipcMain.handle('ym:set-dislike', (_, id: string, disliked: boolean) =>
    requireApi().setDislike(id, disliked)
  )
  ipcMain.handle('ym:lyrics', (_, raw: unknown) => {
    const query = sanitizeLyricsQuery(raw)
    if (!query) throw new Error('Неверный запрос текста')
    // A saved collection brought its lyrics along; they are used first, so they work without a connection.
    const saved = library.lyricsOf(query.id)
    return saved?.source ? saved : lyricsFor(query)
  })
  ipcMain.handle('ym:set-like', (_, id: string, liked: boolean) => requireApi().setLike(id, liked))
  ipcMain.handle('ym:similar', (_, id: string) => requireApi().similar(id))
  ipcMain.handle('ym:pins', () => requireApi().pins())
  ipcMain.handle('ym:playlists', () => requireApi().playlists())
  ipcMain.handle('ym:create-playlist', (_, title: unknown) => {
    const name = typeof title === 'string' ? title.trim().slice(0, PLAYLIST_TITLE_LIMIT) : ''
    if (!name) throw new Error('У плейлиста должно быть название')
    return requireApi().createPlaylist(name)
  })
  ipcMain.handle('ym:add-to-playlist', (_, kind: unknown, trackId: unknown, albumId: unknown) => {
    if (typeof kind !== 'number' || !Number.isInteger(kind) || typeof trackId !== 'string')
      throw new Error('Неверный плейлист или трек')
    return requireApi().addToPlaylist(kind, {
      id: trackId,
      albumId: typeof albumId === 'number' ? albumId : undefined
    })
  })
  ipcMain.handle('ym:collection', async (_, ref: CollectionRef) => {
    try {
      return await requireApi().collection(ref)
    } catch (error) {
      const saved = library.get(refKey(ref))?.collection
      if (saved && !isAuthFailure(error)) return saved
      throw error
    }
  })
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

  /* ---------- caching, offline collections, saving a track as a file ---------- */

  // Only one prefetch at a time: a new one is not worth starting while the last still runs.
  let prefetching: Promise<unknown> | null = null
  ipcMain.handle('cache:prefetch', (_, id: unknown) => {
    if (typeof id !== 'string' || prefetching || files.find(id, streamer.quality)) return
    prefetching = files
      .download(id, streamer.quality, 'stream')
      .catch(() => undefined)
      .finally(() => {
        prefetching = null
      })
  })

  ipcMain.handle('offline:state', (): OfflineState => library.state())
  ipcMain.handle('offline:save', async (_, target: unknown) => {
    const client = requireApi()
    if (target === 'liked') {
      return library.save('liked', async () => ({
        title: 'Мне нравится',
        subtitle: 'Любимые треки',
        tracks: await client.likedTracks(LIKED_OFFLINE_LIMIT)
      }))
    }
    const ref = target as CollectionRef
    if (!ref || !['playlist', 'album', 'artist'].includes(ref.type))
      throw new Error('Неверный запрос')
    return library.save(refKey(ref), async () => {
      const collection = await client.collection(ref)
      return {
        title: collection.title,
        subtitle: collection.subtitle,
        coverUri: collection.coverUri,
        tracks: collection.tracks,
        collection
      }
    })
  })
  ipcMain.handle('offline:cancel', (_, key: unknown) => {
    if (typeof key === 'string') library.cancel(key)
  })
  ipcMain.handle('offline:remove', (_, key: unknown) => {
    if (typeof key === 'string') library.remove(key)
  })
  ipcMain.handle('offline:remove-all', () => library.removeAll())
  ipcMain.handle('cache:info', (): CacheInfo => ({ ...files.sizes(), collections: library.list() }))
  ipcMain.handle('cache:clear-stream', () => files.clear('stream'))

  const downloads = (): string => join(app.getPath('downloads'), 'trashee')
  ipcMain.handle('track:download', async (_, raw: unknown) => {
    const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    if (typeof input.id !== 'string' || typeof input.title !== 'string')
      throw new Error('Неверный запрос')
    const artists = Array.isArray(input.artists)
      ? input.artists.filter((a) => typeof a === 'string')
      : []
    // The track goes through the disk cache, so a track that is already cached is not fetched again.
    const cached = await files.download(input.id, streamer.quality, 'stream')
    mkdirSync(downloads(), { recursive: true })
    const name = safeFileName([artists.join(', '), input.title].filter(Boolean).join(' - '))
    let target = join(downloads(), `${name}.${cached.ext}`)
    for (let n = 2; existsSync(target); n++)
      target = join(downloads(), `${name} (${n}).${cached.ext}`)
    copyFileSync(cached.file, target)
    return target
  })
  ipcMain.handle('app:reveal', (_, path: unknown) => {
    // Only files this app saved can be shown.
    if (typeof path === 'string' && dirname(path) === downloads() && parse(path).base) {
      shell.showItemInFolder(path)
    }
  })
}
