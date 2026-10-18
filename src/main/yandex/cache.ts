import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync
} from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import { decryptFrom } from './decrypt.ts'

/** Where a track can be fetched from right now, as Yandex describes it. */
export interface StreamSource {
  url: string
  codec: string
  transport: string
  key?: string
}

const EXT_BY_CODEC: Record<string, string> = {
  mp3: 'mp3',
  aac: 'aac',
  'he-aac': 'aac',
  flac: 'flac',
  'aac-mp4': 'm4a',
  'he-aac-mp4': 'm4a',
  'flac-mp4': 'm4a'
}

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4'
}

export type Place = 'stream' | 'offline'

export interface Cached {
  file: string
  ext: string
  size: number
  place: Place
}

export interface CacheEntry {
  file: string
  size: number
  mtime: number
}

/** The oldest files go first until the rest fits in `limit` bytes. */
export function chooseEvictions(entries: CacheEntry[], limit: number): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.size, 0)
  const doomed: string[] = []
  for (const entry of [...entries].sort((a, b) => a.mtime - b.mtime)) {
    if (total <= limit) break
    doomed.push(entry.file)
    total -= entry.size
  }
  return doomed
}

export interface ByteRange {
  start: number
  end: number
}

/** The first range of a Range header ("bytes=10-", "bytes=0-99", "bytes=-500"), or null when there is none or it makes no sense. */
export function parseRange(header: string | null | undefined, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)/.exec(header ?? '')
  if (!match || (match[1] === '' && match[2] === '') || size <= 0) return null
  let start: number
  let end: number
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  return start > end || start >= size ? null : { start, end }
}

/** A name that is safe on every file system: no separators or reserved characters, not too long. */
export function safeFileName(name: string, max = 120): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
  return (cleaned.slice(0, max).trim() || 'track').replace(/[.\s]+$/g, '')
}

export interface TrackCacheOptions {
  /** How many bytes the automatic cache of heard and prefetched tracks may take. */
  streamLimit: number
  /** Looks up the download link of a track; called each time a download starts. */
  resolve: (trackId: string, quality: string) => Promise<StreamSource>
  fetch?: typeof fetch
}

const STAMP = /^(.+)-(nq|hq|lossless)\.(mp3|aac|flac|m4a)$/

/**
 * Whole tracks on disk, decrypted. "stream" is a cache that empties itself, oldest first; "offline" is
 * what the user saved on purpose and stays until it is removed.
 */
export class TrackCache {
  private readonly root: string
  private readonly options: TrackCacheOptions
  private readonly inFlight = new Map<string, Promise<Cached>>()

  constructor(root: string, options: TrackCacheOptions) {
    this.root = root
    this.options = options
    for (const place of ['stream', 'offline'] as const)
      mkdirSync(this.dir(place), { recursive: true })
  }

  private dir(place: Place): string {
    return join(this.root, place)
  }

  private entries(place: Place): { id: string; quality: string; ext: string; path: string }[] {
    const found: { id: string; quality: string; ext: string; path: string }[] = []
    for (const name of readdirSync(this.dir(place))) {
      const match = STAMP.exec(name)
      if (match)
        found.push({
          id: match[1],
          quality: match[2],
          ext: match[3],
          path: join(this.dir(place), name)
        })
    }
    return found
  }

  /** Saved tracks count in any quality; the automatic cache only in the quality being listened to. */
  find(trackId: string, quality: string): Cached | null {
    const saved = this.entries('offline').find((entry) => entry.id === trackId)
    if (saved)
      return { file: saved.path, ext: saved.ext, size: statSync(saved.path).size, place: 'offline' }
    const heard = this.entries('stream').find(
      (entry) => entry.id === trackId && entry.quality === quality
    )
    if (heard) {
      const now = new Date()
      utimesSync(heard.path, now, now) // read recently = keep longest
      return { file: heard.path, ext: heard.ext, size: statSync(heard.path).size, place: 'stream' }
    }
    return null
  }

  /** Ids of every track saved for offline listening. */
  savedIds(): string[] {
    return [...new Set(this.entries('offline').map((entry) => entry.id))]
  }

  isSaved(trackId: string): boolean {
    return this.entries('offline').some((entry) => entry.id === trackId)
  }

  /** Downloads a whole track into `place`; asking again while it is running gives the same download. */
  download(trackId: string, quality: string, place: Place): Promise<Cached> {
    const key = `${place}:${trackId}:${quality}`
    const running = this.inFlight.get(key)
    if (running) return running
    const job = this.run(trackId, quality, place).finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, job)
    return job
  }

  private async run(trackId: string, quality: string, place: Place): Promise<Cached> {
    const known = this.find(trackId, quality)
    if (known && (known.place === place || known.place === 'offline')) return known

    const source = await this.options.resolve(trackId, quality)
    const ext = EXT_BY_CODEC[source.codec] ?? 'mp3'
    const target = join(this.dir(place), `${trackId}-${quality}.${ext}`)
    const partial = `${target}.part`
    const response = await (this.options.fetch ?? fetch)(source.url)
    if (!response.ok || !response.body) throw new Error(`Сервер ответил ${response.status}`)

    let body: ReadableStream<Uint8Array> = response.body
    if (source.transport === 'encraw' && source.key)
      body = body.pipeThrough(decryptFrom(source.key, 0))
    try {
      await pipeline(
        Readable.fromWeb(body as unknown as WebReadableStream),
        createWriteStream(partial)
      )
      renameSync(partial, target)
    } catch (error) {
      rmSync(partial, { force: true })
      throw error
    }
    if (place === 'stream') this.trim()
    return { file: target, ext, size: statSync(target).size, place }
  }

  /** Keeps the automatic cache under its limit. */
  trim(): void {
    const entries: CacheEntry[] = this.entries('stream').map((entry) => {
      const stat = statSync(entry.path)
      return { file: entry.path, size: stat.size, mtime: stat.mtimeMs }
    })
    for (const file of chooseEvictions(entries, this.options.streamLimit))
      rmSync(file, { force: true })
  }

  sizes(): { stream: number; offline: number; offlineTracks: number } {
    const total = (place: Place): number =>
      this.entries(place).reduce((sum, entry) => sum + statSync(entry.path).size, 0)
    return {
      stream: total('stream'),
      offline: total('offline'),
      offlineTracks: this.entries('offline').length
    }
  }

  clear(place: Place): void {
    for (const entry of this.entries(place)) rmSync(entry.path, { force: true })
  }

  /** Forgets a saved track (the automatic cache is not touched). */
  removeSaved(trackId: string): void {
    for (const entry of this.entries('offline'))
      if (entry.id === trackId) rmSync(entry.path, { force: true })
  }

  exists(file: string): boolean {
    return existsSync(file)
  }
}

/** Serves a cached file, honoring a Range header, the way the network path does. */
export function serveFile(cached: Cached, rangeHeader: string | null): Response {
  const range = parseRange(rangeHeader, cached.size)
  const headers = new Headers({
    'Content-Type': MIME_BY_EXT[cached.ext] ?? 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
  })
  const { start, end } = range ?? { start: 0, end: cached.size - 1 }
  headers.set('Content-Length', String(end - start + 1))
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${cached.size}`)
  const stream = Readable.toWeb(
    createReadStream(cached.file, { start, end })
  ) as unknown as ReadableStream
  return new Response(stream, { status: range ? 206 : 200, headers })
}
