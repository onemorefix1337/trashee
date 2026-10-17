import { createHmac } from 'node:crypto'

// Constants of the official Yandex Music apps; the API is private, so third-party clients reuse them.
export const ANDROID_CLIENT = 'YandexMusicAndroid/24023621'
export const DESKTOP_CLIENT = 'YandexMusicDesktopAppWindows/5.95.0'
const DESKTOP_SIGN_KEY = 'kzqU4XhfCaY6B6JTHODeq5'
const ANDROID_SIGN_KEY = 'p93jhgh689SBReK6ghtw62'

export const FILE_INFO_CODECS = {
  lossless: ['flac', 'aac', 'mp3'],
  hq: ['aac', 'mp3'],
  nq: ['aac', 'mp3']
} as const

/** Signature of /get-file-info. It is checked together with the X-Yandex-Music-Client header. */
export function fileInfoSign(
  trackId: string,
  quality: string,
  codecs: readonly string[],
  transport: string
): { ts: number; sign: string } {
  const ts = Math.floor(Date.now() / 1000)
  const message = `${ts}${trackId}${quality}${codecs.join('')}${transport}`
  const digest = createHmac('sha256', DESKTOP_SIGN_KEY).update(message).digest('base64')
  // The server expects the base64 value without its trailing padding character.
  return { ts, sign: digest.slice(0, -1) }
}

/** Signature of /tracks/{id}/lyrics; unlike get-file-info it uses the Android key and keeps the padding. */
export function lyricsSign(trackId: string): { ts: number; sign: string } {
  const ts = Math.floor(Date.now() / 1000)
  const numericId = trackId.split(':')[0]
  const sign = createHmac('sha256', ANDROID_SIGN_KEY).update(`${numericId}${ts}`).digest('base64')
  return { ts, sign }
}
