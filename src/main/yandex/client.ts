import { YandexMusicError } from './errors'
import {
  coverOf,
  normalizeAlbumInfo,
  normalizeArtists,
  normalizePin,
  normalizePlaylistInfo,
  normalizeTrack,
  ownerName,
  playlistRef
} from './normalize'
import { parseLrc } from '../../shared/lrc'
import { YANDEX_SOURCE } from '../../shared/lyrics-resolve'
import { ANDROID_CLIENT, DESKTOP_CLIENT, FILE_INFO_CODECS, fileInfoSign, lyricsSign } from './sign'
import type {
  Account,
  AlbumInfo,
  Collection,
  CollectionRef,
  FileInfo,
  Lyrics,
  Pin,
  PlaylistInfo,
  Quality,
  Track,
  Transport,
  WaveBatch,
  WaveEvent
} from '../../shared/types'

const BASE = 'https://api.music.yandex.net'
const WAVE_SEED = 'user:onyourwave'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | boolean>
  form?: Record<string, string>
  json?: unknown
  headers?: Record<string, string>
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const TRACKS_PER_REQUEST = 100
const ARTIST_TRACKS = 100
const ARTIST_ALBUMS = 50

export class YandexMusic {
  private uid: number | null = null

  constructor(private readonly token: string) {}

  private async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(BASE + path)
    for (const [key, value] of Object.entries(opts.query ?? {}))
      url.searchParams.set(key, String(value))

    const headers: Record<string, string> = {
      Authorization: `OAuth ${this.token}`,
      'X-Yandex-Music-Client': ANDROID_CLIENT,
      'User-Agent': 'Yandex-Music-API',
      'Accept-Language': 'ru',
      ...opts.headers
    }
    let body: string | URLSearchParams | undefined
    if (opts.form) {
      body = new URLSearchParams(opts.form)
    } else if (opts.json !== undefined) {
      body = JSON.stringify(opts.json)
      headers['Content-Type'] = 'application/json'
    }

    const res = await fetch(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body })
    const text = await res.text()
    let parsed: any = null
    try {
      parsed = JSON.parse(text)
    } catch {
      /* non-JSON body */
    }
    if (!res.ok) {
      const message = parsed?.error?.message ?? parsed?.result?.message ?? `HTTP ${res.status}`
      throw new YandexMusicError(message, res.status)
    }
    return (parsed?.result ?? parsed) as T
  }

  async account(): Promise<Account> {
    const result = await this.request<any>('/account/status')
    if (!result?.account?.uid) throw new YandexMusicError('Токен недействителен', 401)
    this.uid = result.account.uid
    return {
      uid: result.account.uid,
      login: result.account.login ?? result.account.displayName ?? '',
      hasPlus: result.plus?.hasPlus === true
    }
  }

  private async userId(): Promise<number> {
    return this.uid ?? (await this.account()).uid
  }

  async search(text: string): Promise<Track[]> {
    const result = await this.request<any>('/search', {
      query: { text, nocorrect: false, type: 'track', page: 0, 'playlist-in-best': true }
    })
    return (result?.tracks?.results ?? []).map(normalizeTrack)
  }

  async tracks(ids: string[]): Promise<Track[]> {
    if (ids.length === 0) return []
    const result = await this.request<any[]>('/tracks', { form: { 'track-ids': ids.join(',') } })
    return result.map(normalizeTrack)
  }

  async similar(trackId: string): Promise<Track[]> {
    const result = await this.request<any>(`/tracks/${trackId}/similar`)
    return (result?.similarTracks ?? []).map(normalizeTrack)
  }

  async likedTracks(limit = 150): Promise<Track[]> {
    const uid = await this.userId()
    const result = await this.request<any>(`/users/${uid}/likes/tracks`)
    const items: any[] = result?.library?.tracks ?? []
    const newestFirst = items
      .sort((a, b) => String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? '')))
      .slice(0, limit)
    const tracks = await this.tracks(
      newestFirst.map((t) => (t.albumId ? `${t.id}:${t.albumId}` : String(t.id)))
    )
    // /tracks does not preserve the requested order.
    const order = new Map(newestFirst.map((t, i) => [String(t.id), i]))
    return tracks.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  }

  async likedIds(): Promise<string[]> {
    const uid = await this.userId()
    const result = await this.request<any>(`/users/${uid}/likes/tracks`)
    return (result?.library?.tracks ?? []).map((t: any) => String(t.id))
  }

  async setLike(trackId: string, liked: boolean): Promise<void> {
    const uid = await this.userId()
    const action = liked ? 'add-multiple' : 'remove'
    await this.request(`/users/${uid}/likes/tracks/${action}`, { form: { 'track-ids': trackId } })
  }

  async setDislike(trackId: string, disliked: boolean): Promise<void> {
    const uid = await this.userId()
    const action = disliked ? 'add-multiple' : 'remove'
    await this.request(`/users/${uid}/dislikes/tracks/${action}`, {
      form: { 'track-ids': trackId }
    })
  }

  /** Synced lyrics when the track has them, plain text otherwise, empty when there are none. */
  async lyrics(trackId: string): Promise<Lyrics> {
    const synced = await this.lyricsText(trackId, 'LRC')
    if (synced) {
      const lines = parseLrc(synced)
      if (lines.length > 0) return { synced: lines, text: null, source: YANDEX_SOURCE }
    }
    const text = (await this.lyricsText(trackId, 'TEXT'))?.trim()
    return text
      ? { synced: null, text, source: YANDEX_SOURCE }
      : { synced: null, text: null, source: null }
  }

  /** The lyrics endpoint only hands out a link; the text itself lives behind it. */
  private async lyricsText(trackId: string, format: 'LRC' | 'TEXT'): Promise<string | null> {
    try {
      const { ts, sign } = lyricsSign(trackId)
      const info = await this.request<any>(`/tracks/${trackId}/lyrics`, {
        query: { format, timeStamp: ts, sign }
      })
      if (!info?.downloadUrl) return null
      const res = await fetch(info.downloadUrl, { signal: AbortSignal.timeout(15_000) })
      return res.ok ? await res.text() : null
    } catch (error) {
      // "This track has no lyrics" arrives as a client error; only real failures are worth reporting.
      const status = error instanceof YandexMusicError ? error.status : undefined
      if (status !== undefined && status >= 400 && status < 500) return null
      throw error
    }
  }

  /** Download info of a track. The returned URL is short-lived. */
  async fileInfo(trackId: string, quality: Quality, transport: Transport): Promise<FileInfo> {
    const codecs = FILE_INFO_CODECS[quality]
    const { ts, sign } = fileInfoSign(trackId, quality, codecs, transport)
    const result = await this.request<any>('/get-file-info', {
      query: { ts, trackId, quality, codecs: codecs.join(','), transports: transport, sign },
      headers: { 'X-Yandex-Music-Client': DESKTOP_CLIENT }
    })
    const info = result?.downloadInfo
    if (!info?.url) throw new YandexMusicError('Нет ссылки на файл трека')
    return {
      trackId: String(info.trackId ?? trackId),
      quality: info.quality,
      codec: info.codec,
      bitrate: info.bitrate,
      transport: info.transport,
      url: info.url,
      key: info.key || undefined
    }
  }

  /** Items pinned to the sidebar: playlists (own and other people's), albums, artists and waves. */
  async pins(): Promise<Pin[]> {
    const result = await this.request<any>('/pins')
    return (result?.pins ?? [])
      .map(normalizePin)
      .filter((pin: Pin | null): pin is Pin => pin !== null)
  }

  /** Own playlists followed by playlists saved from other people. */
  async playlists(): Promise<PlaylistInfo[]> {
    const uid = await this.userId()
    const [own, saved] = await Promise.all([
      this.request<any[]>(`/users/${uid}/playlists/list`),
      // A failure here should not hide the user's own playlists.
      this.request<any[]>(`/users/${uid}/likes/playlists`).catch(() => [] as any[])
    ])
    const seen = new Set<string>()
    return [...(own ?? []), ...(saved ?? []).map((like) => like?.playlist ?? like)]
      .map((raw) => normalizePlaylistInfo(raw, uid))
      .filter((info): info is PlaylistInfo => {
        if (!info || seen.has(info.key)) return false
        seen.add(info.key)
        return true
      })
  }

  async collection(ref: CollectionRef): Promise<Collection> {
    switch (ref.type) {
      case 'playlist': {
        const path =
          ref.uid !== undefined && ref.kind !== undefined
            ? `/users/${ref.uid}/playlists/${ref.kind}`
            : `/playlist/${ref.uuid}`
        const raw = await this.request<any>(path)
        const tracks = await this.resolveTrackItems(raw?.tracks ?? [])
        return {
          ref: playlistRef(raw) ?? ref,
          title: raw?.title ?? 'Плейлист',
          subtitle: ownerName(raw),
          coverUri: coverOf(raw),
          trackCount: raw?.trackCount ?? tracks.length,
          tracks,
          artists: [],
          albums: []
        }
      }
      case 'album': {
        const raw = await this.request<any>(`/albums/${ref.id}/with-tracks`)
        const tracks: Track[] = (raw?.volumes ?? []).flat().map(normalizeTrack)
        return {
          ref,
          title: raw?.title ?? 'Альбом',
          subtitle: (raw?.artists ?? []).map((artist: any) => artist.name).join(', '),
          coverUri: raw?.coverUri ?? raw?.ogImage,
          trackCount: raw?.trackCount ?? tracks.length,
          tracks,
          artists: normalizeArtists(raw),
          albums: []
        }
      }
      case 'artist': {
        const [info, list, releases] = await Promise.all([
          this.request<any>(`/artists/${ref.id}/brief-info`),
          this.request<any>(`/artists/${ref.id}/tracks`, {
            query: { page: 0, 'page-size': ARTIST_TRACKS }
          }),
          // Releases are a bonus: the page is still useful without them.
          this.request<any>(`/artists/${ref.id}/direct-albums`, {
            query: { page: 0, 'page-size': ARTIST_ALBUMS, 'sort-by': 'year' }
          }).catch(() => null)
        ])
        const tracks: Track[] = (list?.tracks ?? []).map(normalizeTrack)
        const albums = (releases?.albums ?? [])
          .map(normalizeAlbumInfo)
          .filter((album: AlbumInfo | null): album is AlbumInfo => album !== null)
          .sort((a: AlbumInfo, b: AlbumInfo) => (b.year ?? 0) - (a.year ?? 0))
        return {
          ref,
          title: info?.artist?.name ?? 'Исполнитель',
          subtitle: 'Исполнитель',
          coverUri: coverOf(info?.artist),
          trackCount: tracks.length,
          tracks,
          artists: [],
          albums
        }
      }
    }
  }

  async setPin(ref: CollectionRef, pinned: boolean): Promise<void> {
    const method = pinned ? 'PUT' : 'DELETE'
    switch (ref.type) {
      case 'playlist':
        if (ref.uid === undefined || ref.kind === undefined) {
          throw new YandexMusicError('У этого плейлиста нельзя поменять закрепление')
        }
        return void (await this.request('/pin/playlist', {
          method,
          json: { uid: ref.uid, kind: ref.kind }
        }))
      case 'album':
        return void (await this.request('/pin/album', { method, json: { id: ref.id } }))
      case 'artist':
        return void (await this.request('/pin/artist', { method, json: { id: ref.id } }))
    }
  }

  /**
   * Playlist entries usually carry the full track; the rest are fetched in batches.
   * The list keeps its order, and entries that cannot be loaded are dropped.
   */
  private async resolveTrackItems(items: any[]): Promise<Track[]> {
    const resolved: (Track | null)[] = items.map((item) =>
      item?.track ? normalizeTrack(item.track) : null
    )
    const missing = items.flatMap((item, index) =>
      resolved[index] || item?.id === undefined
        ? []
        : [{ index, id: item.albumId ? `${item.id}:${item.albumId}` : String(item.id) }]
    )
    for (let from = 0; from < missing.length; from += TRACKS_PER_REQUEST) {
      const batch = missing.slice(from, from + TRACKS_PER_REQUEST)
      const loaded = new Map(
        (await this.tracks(batch.map((entry) => entry.id))).map((t) => [t.id, t])
      )
      for (const entry of batch) resolved[entry.index] = loaded.get(entry.id.split(':')[0]) ?? null
    }
    return resolved.filter((track): track is Track => track !== null)
  }

  async waveStart(seed = WAVE_SEED): Promise<WaveBatch> {
    const result = await this.request<any>('/rotor/session/new', {
      json: { seeds: [seed], includeTracksInResponse: true }
    })
    return {
      sessionId: result.radioSessionId,
      batchId: result.batchId,
      tracks: this.waveTracks(result)
    }
  }

  async waveNext(sessionId: string, lastTrackId: string): Promise<WaveBatch> {
    const result = await this.request<any>(`/rotor/session/${sessionId}/tracks`, {
      json: { queue: [lastTrackId] }
    })
    return { sessionId, batchId: result.batchId, tracks: this.waveTracks(result) }
  }

  async waveFeedback(
    sessionId: string,
    batchId: string,
    type: WaveEvent,
    trackId?: string,
    playedSeconds?: number
  ): Promise<void> {
    await this.request(`/rotor/session/${sessionId}/feedback`, {
      json: {
        event: {
          type,
          timestamp: new Date().toISOString(),
          ...(trackId ? { trackId } : {}),
          ...(playedSeconds !== undefined ? { totalPlayedSeconds: playedSeconds } : {})
        },
        batchId,
        from: 'radio-mobile-user-onyourwave'
      }
    })
  }

  private waveTracks(result: any): Track[] {
    return (result.sequence ?? [])
      .filter((item: any) => item.type === 'track' && item.track)
      .map((item: any) => normalizeTrack(item.track))
  }
}
