import type { Lyrics, Track } from '../../../shared/types'

const cache = new Map<string, Lyrics>()
const pending = new Map<string, Promise<Lyrics>>()

/** Lyrics that were already fetched in this session. */
export const cachedLyrics = (id: string): Lyrics | undefined => cache.get(id)

/** Lyrics of a track, from the cache or from the main process; everyone asking at once shares one fetch. */
export function loadLyrics(track: Track): Promise<Lyrics> {
  const known = cache.get(track.id)
  if (known) return Promise.resolve(known)
  const running = pending.get(track.id)
  if (running) return running
  const job = window.api
    .lyrics({
      id: track.id,
      title: track.title,
      artists: track.artists.map((artist) => artist.name),
      album: track.albums[0]?.title,
      durationSec: track.durationMs / 1000
    })
    .then((lyrics) => {
      cache.set(track.id, lyrics)
      return lyrics
    })
    .finally(() => pending.delete(track.id))
  pending.set(track.id, job)
  return job
}
