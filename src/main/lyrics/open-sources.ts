import { app } from 'electron'
import { parseLrc } from '../../shared/lrc'
import { pickBest, type LyricsCandidate } from '../../shared/lyrics-match'
import { LRCLIB_SOURCE, OVH_SOURCE, type LyricsProvider } from '../../shared/lyrics-resolve'
import type { Lyrics } from '../../shared/types'

const TIMEOUT_MS = 6_000
const LRCLIB = 'https://lrclib.net/api'
const OVH = 'https://api.lyrics.ovh/v1'

const userAgent = (): string =>
  `trashee/${app.getVersion()} (https://github.com/onemorefix1337/trashee)`

/** JSON from an open API; any failure (no network, 404, bad body) simply means "nothing here". */
async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

function fromCandidate(candidate: LyricsCandidate): Lyrics | null {
  if (candidate.instrumental) {
    return { synced: null, text: null, source: LRCLIB_SOURCE, instrumental: true }
  }
  const lines = candidate.syncedLyrics ? parseLrc(candidate.syncedLyrics) : []
  if (lines.length > 0) return { synced: lines, text: null, source: LRCLIB_SOURCE }
  const text = candidate.plainLyrics?.trim()
  return text ? { synced: null, text, source: LRCLIB_SOURCE } : null
}

/** LRCLIB: a free community database with synced (LRC) and plain lyrics, no key needed. */
const lrclib: LyricsProvider = {
  canSync: true,
  async find(query) {
    const artist = query.artists[0] ?? ''
    const exact = new URLSearchParams({
      track_name: query.title,
      artist_name: artist,
      duration: String(Math.round(query.durationSec))
    })
    if (query.album) exact.set('album_name', query.album)
    const direct = await getJson<LyricsCandidate>(`${LRCLIB}/get?${exact}`)
    if (direct) {
      const found = fromCandidate(direct)
      if (found) return found
    }

    // Titles and artists are spelled differently across catalogs; fall back to a search and judge the results.
    const search = new URLSearchParams({ track_name: query.title, artist_name: artist })
    let results = await getJson<LyricsCandidate[]>(`${LRCLIB}/search?${search}`)
    if (!results?.length) {
      const loose = new URLSearchParams({ q: `${artist} ${query.title}`.trim() })
      results = await getJson<LyricsCandidate[]>(`${LRCLIB}/search?${loose}`)
    }
    const best = results ? pickBest(results, query) : null
    return best ? fromCandidate(best) : null
  }
}

/** lyrics.ovh: plain text only, patchy coverage, but a different catalog from LRCLIB. */
const ovh: LyricsProvider = {
  canSync: false,
  async find(query) {
    const artist = query.artists[0]
    if (!artist || !query.title) return null
    const body = await getJson<{ lyrics?: string }>(
      `${OVH}/${encodeURIComponent(artist)}/${encodeURIComponent(query.title)}`
    )
    // The service sometimes starts with a "Paroles de la chanson ..." line of its own.
    const text = body?.lyrics
      ?.replace(/^Paroles de la chanson[^\n]*\r?\n/, '')
      .replace(/\r\n/g, '\n')
      .trim()
    return text ? { synced: null, text, source: OVH_SOURCE } : null
  }
}

export const OPEN_SOURCES: LyricsProvider[] = [lrclib, ovh]
