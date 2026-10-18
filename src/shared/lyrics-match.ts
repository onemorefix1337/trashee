import type { LyricsQuery } from './types'

/** A track as an open lyrics database describes it. */
export interface LyricsCandidate {
  trackName: string
  artistName: string
  /** Seconds. */
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

// The length of a track differs a little between releases; more than this is a different recording.
const DURATION_TOLERANCE_SEC = 4

/** Lowercase words only: no "(feat. ...)", "- Remastered", punctuation, or accents on "ё". */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(
      /\s[-–—]\s(?:.*\b)?(?:remaster(?:ed)?|live|version|mix|edit|radio|deluxe|bonus)\b.*$/u,
      ' '
    )
    .replace(/\b(?:feat|ft|featuring)\b\.?.*$/u, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const normalizeName = (name: string): string => normalizeTitle(name.replace(/&|,|;/g, ' '))

function sameArtist(candidate: string, wanted: string[]): boolean {
  const have = normalizeName(candidate)
  if (!have) return false
  return wanted.some((artist) => {
    const want = normalizeName(artist)
    return want !== '' && (have.includes(want) || want.includes(have))
  })
}

/** The best candidate for the wanted track, or null when nothing really is that track. Synced text wins ties. */
export function pickBest(
  candidates: LyricsCandidate[],
  wanted: Pick<LyricsQuery, 'title' | 'artists' | 'durationSec'>
): LyricsCandidate | null {
  const title = normalizeTitle(wanted.title)
  if (!title) return null

  const matching = candidates.filter((candidate) => {
    if (normalizeTitle(candidate.trackName) !== title) return false
    if (!sameArtist(candidate.artistName, wanted.artists)) return false
    if (typeof candidate.duration === 'number' && wanted.durationSec > 0) {
      return Math.abs(candidate.duration - wanted.durationSec) <= DURATION_TOLERANCE_SEC
    }
    return true
  })

  const rank = (candidate: LyricsCandidate): number => {
    const gap =
      typeof candidate.duration === 'number'
        ? Math.abs(candidate.duration - wanted.durationSec)
        : DURATION_TOLERANCE_SEC
    const content = candidate.syncedLyrics ? 0 : candidate.plainLyrics ? 100 : 200
    return content + gap
  }
  return matching.sort((a, b) => rank(a) - rank(b))[0] ?? null
}
