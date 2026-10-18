export interface Artist {
  id: number
  name: string
}

export interface Album {
  id: number
  title: string
  year?: number
}

export interface Track {
  id: string
  title: string
  version?: string
  durationMs: number
  artists: Artist[]
  albums: Album[]
  coverUri?: string
  available: boolean
  explicit: boolean
}

export type Quality = 'lossless' | 'hq' | 'nq'
export type Transport = 'raw' | 'encraw'

export interface FileInfo {
  trackId: string
  quality: string
  codec: string
  bitrate: number
  transport: Transport
  url: string
  key?: string
}

export interface WaveBatch {
  sessionId: string
  batchId: string
  tracks: Track[]
}

export interface Account {
  uid: number
  login: string
  hasPlus: boolean
}

/** Outcome of restoring the saved session at startup. */
export type Restore =
  /** `offline` is set when Yandex could not be reached but saved collections can still be played. */
  | { status: 'ok'; account: Account; offline?: boolean }
  | { status: 'login' }
  /** A token is saved, but Yandex could not be reached; it is kept for the next try. */
  | { status: 'offline' }

export interface DeviceCode {
  deviceCode: string
  userCode: string
  verificationUrl: string
  interval: number
  expiresIn: number
}

/** Something with a list of tracks that can be opened, played and pinned. */
export type CollectionRef =
  | { type: 'playlist'; uid?: number; kind?: number; uuid?: string; login?: string }
  | { type: 'album'; id: number }
  | { type: 'artist'; id: number }

/** An album as listed on an artist page. */
export interface AlbumInfo {
  id: number
  title: string
  year?: number
  coverUri?: string
  trackCount: number
  /** Release kind as Yandex names it: "single", "compilation", and so on; absent for a plain album. */
  kind?: string
}

export interface Collection {
  ref: CollectionRef
  title: string
  /** Owner of a playlist, artists of an album, "Исполнитель" for an artist. */
  subtitle: string
  coverUri?: string
  trackCount: number
  tracks: Track[]
  /** Who made it, as links: the artists of an album. Empty for playlists and artist pages. */
  artists: Artist[]
  /** The artist's releases, newest first. Empty everywhere but on an artist page. */
  albums: AlbumInfo[]
}

/** A playlist as listed in the collection (own or saved from other people). */
export interface PlaylistInfo {
  ref: CollectionRef
  key: string
  title: string
  owner: string
  mine: boolean
  coverUri?: string
  trackCount: number
}

/** An item pinned to the sidebar. A wave has a seed instead of a ref. */
export interface Pin {
  key: string
  type: 'playlist' | 'album' | 'artist' | 'wave'
  title: string
  subtitle: string
  coverUri?: string
  ref?: CollectionRef
  seed?: string
}

/** What the radio is told about playback; "like" and "dislike" only tune recommendations. */
export type WaveEvent =
  'radioStarted' | 'trackStarted' | 'trackFinished' | 'skip' | 'like' | 'dislike'

export interface LyricLine {
  /** Seconds from the start of the track. */
  time: number
  /** Empty for an instrumental gap. */
  text: string
}

/** Where a text came from, shown under it. */
export interface LyricsSource {
  name: string
  url?: string
}

/** Either synced lines, or plain text, or neither when the track has no lyrics. */
export interface Lyrics {
  synced: LyricLine[] | null
  text: string | null
  /** Null when no source had a text. */
  source: LyricsSource | null
  /** An open source says the track has no words at all. */
  instrumental?: boolean
}

/** What is needed to look a track up by name in sources that know nothing about Yandex ids. */
export interface LyricsQuery {
  id: string
  title: string
  artists: string[]
  album?: string
  durationSec: number
}

/** How far saving a collection for offline listening has got. */
export interface OfflineProgress {
  status: 'saving' | 'saved'
  done: number
  total: number
  /** Tracks that could not be fetched; the rest of the collection is saved anyway. */
  failed: number
}

/** Saved and being-saved collections by key ("playlist:1:2", "album:3", "liked"). */
export type OfflineState = Record<string, OfflineProgress>

export interface SavedInfo {
  key: string
  title: string
  subtitle: string
  trackCount: number
  savedAt: number
}

/** What the caches take on disk, and which collections were saved on purpose. */
export interface CacheInfo {
  stream: number
  offline: number
  offlineTracks: number
  collections: SavedInfo[]
}
