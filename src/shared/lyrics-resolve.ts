import type { Lyrics, LyricsQuery, LyricsSource } from './types'

export const YANDEX_SOURCE: LyricsSource = { name: 'Яндекс Музыка' }
export const LRCLIB_SOURCE: LyricsSource = { name: 'LRCLIB', url: 'https://lrclib.net' }
export const OVH_SOURCE: LyricsSource = { name: 'lyrics.ovh', url: 'https://lyrics.ovh' }

const NO_LYRICS: Lyrics = { synced: null, text: null, source: null }

export interface LyricsProvider {
  /** Plain-text-only sources are not asked once some plain text is already in hand. */
  canSync: boolean
  find: (query: LyricsQuery) => Promise<Lyrics | null>
}

const hasText = (lyrics: Lyrics | null | undefined): lyrics is Lyrics =>
  !!lyrics && (lyrics.synced !== null || !!lyrics.text)

/**
 * Yandex first. Its synced text is final; plain text, or none, sends the search on to open sources, in order.
 * Synced text from anywhere beats plain text; plain text from Yandex beats plain text from the rest.
 * When Yandex itself failed and nothing else had a text, the failure is passed on so the player can offer a retry.
 */
export async function resolveLyrics(
  query: LyricsQuery,
  yandex: () => Promise<Lyrics>,
  providers: LyricsProvider[]
): Promise<Lyrics> {
  let failure: unknown = null
  let own: Lyrics | null = null
  try {
    own = await yandex()
  } catch (error) {
    failure = error
  }
  if (own?.synced) return own

  let best: Lyrics | null = hasText(own) ? own : null
  let instrumental = false
  for (const provider of providers) {
    // With some text in hand, only a source that may have it synced is worth asking.
    if (best && !provider.canSync) continue
    const found = await provider.find(query).catch(() => null)
    if (found?.instrumental) instrumental = true
    if (!hasText(found)) continue
    if (found.synced) return found
    if (!best) best = found
  }

  if (best) return best
  if (failure) throw failure
  return instrumental ? { ...NO_LYRICS, instrumental: true, source: LRCLIB_SOURCE } : NO_LYRICS
}
