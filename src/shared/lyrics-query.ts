import type { LyricsQuery } from './types'

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max).trim() : ''

/** The query comes from the player window; keep only well-formed, bounded fields before it goes into URLs. */
export function sanitizeLyricsQuery(raw: unknown): LyricsQuery | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const id = text(input.id, 40)
  const title = text(input.title, 300)
  if (!id || !title) return null
  const artists = Array.isArray(input.artists)
    ? input.artists
        .map((artist) => text(artist, 200))
        .filter(Boolean)
        .slice(0, 8)
    : []
  const duration =
    typeof input.durationSec === 'number' && Number.isFinite(input.durationSec)
      ? Math.max(0, input.durationSec)
      : 0
  return {
    id,
    title,
    artists,
    album: text(input.album, 300) || undefined,
    durationSec: duration
  }
}
