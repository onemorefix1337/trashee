/** What a link to Yandex Music points at. */
export type YandexLink =
  | { type: 'track'; id: string; albumId?: number }
  | { type: 'album'; id: number }
  | { type: 'artist'; id: number }
  | { type: 'playlist'; login: string; kind: number }
  | { type: 'playlist'; uuid: string }

const HOST = /^(?:www\.)?music\.yandex\.[a-z]{2,3}$/i
const NUMBER = /^\d{1,12}$/

/**
 * Reads a pasted Yandex Music link (album, track, artist, playlist; with or without "https://").
 * Anything else, including a search phrase, gives null.
 */
export function parseYandexLink(text: string): YandexLink | null {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!HOST.test(url.hostname)) return null

  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const [first, second, third, fourth] = parts
  if (first === 'album' && NUMBER.test(second ?? '')) {
    if (third === 'track' && NUMBER.test(fourth ?? ''))
      return { type: 'track', id: fourth, albumId: Number(second) }
    return parts.length === 2 ? { type: 'album', id: Number(second) } : null
  }
  if (first === 'track' && NUMBER.test(second ?? '') && parts.length === 2)
    return { type: 'track', id: second }
  if (first === 'artist' && NUMBER.test(second ?? '') && parts.length === 2)
    return { type: 'artist', id: Number(second) }
  if (first === 'users' && second && third === 'playlists' && NUMBER.test(fourth ?? ''))
    return { type: 'playlist', login: second, kind: Number(fourth) }
  if (first === 'playlists' && /^[\w.-]{6,}$/.test(second ?? '') && parts.length === 2)
    return { type: 'playlist', uuid: second }
  return null
}
