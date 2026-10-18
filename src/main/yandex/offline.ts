import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { Collection, Lyrics, OfflineState, SavedInfo, Track } from '../../shared/types'
import type { TrackCache } from './cache.ts'

// The sizes the interface asks covers in: lists, cards, the collection page, the player.
const COVER_SIZES = ['100x100', '200x200', '400x400', '600x600']
const COVER_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}
const COVER_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}
const PARALLEL = 3

/** Everything a saved collection needs to be shown and played without a connection. */
export interface SavedCollection {
  key: string
  title: string
  subtitle: string
  coverUri?: string
  savedAt: number
  tracks: Track[]
  /** The page as it was shown online; absent for the liked tracks, which are only a list. */
  collection?: Collection
}

export interface Loaded {
  title: string
  subtitle: string
  coverUri?: string
  tracks: Track[]
  collection?: Collection
}

export interface OfflineDeps {
  cache: TrackCache
  quality: () => string
  lyrics: (track: Track) => Promise<Lyrics>
  /** Called with the whole state each time something changes. */
  emit: (state: OfflineState) => void
  fetch?: typeof fetch
}

const hash = (value: string): string => createHash('sha1').update(value).digest('hex')

/** Collections the user chose to keep: tracks, covers, lyrics, and the page itself. */
export class OfflineLibrary {
  private readonly dir: string
  private readonly deps: OfflineDeps
  private saved: Record<string, SavedCollection> = {}
  private readonly running = new Map<
    string,
    { cancelled: boolean; done: number; total: number; failed: number }
  >()

  constructor(root: string, deps: OfflineDeps) {
    this.dir = join(root, 'offline-meta')
    this.deps = deps
    mkdirSync(join(this.dir, 'covers'), { recursive: true })
    mkdirSync(join(this.dir, 'lyrics'), { recursive: true })
    try {
      this.saved = JSON.parse(
        readFileSync(join(this.dir, 'index.json'), 'utf8')
      ) as typeof this.saved
    } catch {
      /* nothing saved yet, or an unreadable index: start empty */
    }
  }

  private persist(): void {
    const target = join(this.dir, 'index.json')
    writeFileSync(`${target}.tmp`, JSON.stringify(this.saved))
    renameSync(`${target}.tmp`, target)
  }

  state(): OfflineState {
    const state: OfflineState = {}
    for (const [key, entry] of Object.entries(this.saved)) {
      state[key] = {
        status: 'saved',
        done: entry.tracks.length,
        total: entry.tracks.length,
        failed: 0
      }
    }
    for (const [key, job] of this.running) {
      state[key] = { status: 'saving', done: job.done, total: job.total, failed: job.failed }
    }
    return state
  }

  private announce(): void {
    this.deps.emit(this.state())
  }

  list(): SavedInfo[] {
    return Object.values(this.saved)
      .map((entry) => ({
        key: entry.key,
        title: entry.title,
        subtitle: entry.subtitle,
        trackCount: entry.tracks.length,
        savedAt: entry.savedAt
      }))
      .sort((a, b) => b.savedAt - a.savedAt)
  }

  get(key: string): SavedCollection | null {
    return this.saved[key] ?? null
  }

  /* ---------- covers and lyrics ---------- */

  coverFile(uri: string, size: string): { file: string; type: string } | null {
    const stem = hash(`${uri}|${size}`)
    for (const ext of Object.keys(COVER_TYPE)) {
      const file = join(this.dir, 'covers', `${stem}.${ext}`)
      if (existsSync(file)) return { file, type: COVER_TYPE[ext] }
    }
    return null
  }

  lyricsOf(trackId: string): Lyrics | null {
    try {
      return JSON.parse(readFileSync(join(this.dir, 'lyrics', `${trackId}.json`), 'utf8')) as Lyrics
    } catch {
      return null
    }
  }

  private async saveCover(uri: string, size: string): Promise<void> {
    if (this.coverFile(uri, size)) return
    const response = await (this.deps.fetch ?? fetch)(`https://${uri.replace('%%', size)}`)
    if (!response.ok) return
    const type = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg'
    const ext = COVER_EXT[type] ?? 'jpg'
    writeFileSync(
      join(this.dir, 'covers', `${hash(`${uri}|${size}`)}.${ext}`),
      Buffer.from(await response.arrayBuffer())
    )
  }

  /* ---------- saving and removing ---------- */

  /** Saves a collection. Tracks that fail are counted and skipped; the rest still gets saved. */
  async save(key: string, load: () => Promise<Loaded>): Promise<void> {
    if (this.running.has(key)) return
    const job = { cancelled: false, done: 0, total: 0, failed: 0 }
    this.running.set(key, job)
    this.announce()
    try {
      const loaded = await load()
      const tracks = loaded.tracks.filter((track) => track.available)
      job.total = tracks.length
      this.announce()

      const quality = this.deps.quality()
      let next = 0
      const work = async (): Promise<void> => {
        while (next < tracks.length && !job.cancelled) {
          const track = tracks[next++]
          try {
            await this.deps.cache.download(track.id, quality, 'offline')
            const lyrics = await this.deps.lyrics(track).catch(() => null)
            if (lyrics)
              writeFileSync(join(this.dir, 'lyrics', `${track.id}.json`), JSON.stringify(lyrics))
          } catch {
            job.failed += 1
          }
          job.done += 1
          this.announce()
        }
      }
      await Promise.all(Array.from({ length: Math.min(PARALLEL, tracks.length) }, work))
      if (job.cancelled) return

      const covers = new Set<string>()
      if (loaded.coverUri) covers.add(loaded.coverUri)
      for (const track of tracks) if (track.coverUri) covers.add(track.coverUri)
      for (const uri of covers) {
        for (const size of COVER_SIZES) await this.saveCover(uri, size).catch(() => undefined)
      }

      this.saved[key] = {
        key,
        title: loaded.title,
        subtitle: loaded.subtitle,
        coverUri: loaded.coverUri,
        savedAt: Date.now(),
        tracks,
        collection: loaded.collection
      }
      this.persist()
    } finally {
      this.running.delete(key)
      this.announce()
    }
  }

  cancel(key: string): void {
    const job = this.running.get(key)
    if (job) job.cancelled = true
  }

  /** Forgets one collection; tracks, lyrics and covers that no other saved collection uses go with it. */
  remove(key: string): void {
    if (!this.saved[key]) return
    delete this.saved[key]
    this.persist()
    this.collectGarbage()
    this.announce()
  }

  removeAll(): void {
    this.saved = {}
    this.persist()
    this.collectGarbage()
    this.announce()
  }

  private collectGarbage(): void {
    const keepTracks = new Set<string>()
    const keepCovers = new Set<string>()
    for (const entry of Object.values(this.saved)) {
      if (entry.coverUri) keepCovers.add(entry.coverUri)
      for (const track of entry.tracks) {
        keepTracks.add(track.id)
        if (track.coverUri) keepCovers.add(track.coverUri)
      }
    }
    for (const name of readdirSync(join(this.dir, 'lyrics'))) {
      if (!keepTracks.has(name.replace(/\.json$/, '')))
        rmSync(join(this.dir, 'lyrics', name), { force: true })
    }
    const keepFiles = new Set<string>()
    for (const uri of keepCovers) {
      for (const size of COVER_SIZES) {
        const found = this.coverFile(uri, size)
        if (found) keepFiles.add(found.file)
      }
    }
    for (const name of readdirSync(join(this.dir, 'covers'))) {
      const file = join(this.dir, 'covers', name)
      if (!keepFiles.has(file)) rmSync(file, { force: true })
    }
    // Saved track files are named after the track id; anything not in a collection any more can go.
    for (const id of this.deps.cache.savedIds())
      if (!keepTracks.has(id)) this.deps.cache.removeSaved(id)
  }
}
