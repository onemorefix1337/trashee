import type { DeviceCode } from '../../shared/types'

// Public OAuth credentials of the official Android app (device flow needs no user password in our app).
const CLIENT_ID = '23cabbbdc6cd418abb4b39c32c41195d'
const CLIENT_SECRET = '53bc75238f0c4d08a118e51fe9203300'
const OAUTH = 'https://oauth.yandex.ru'
const REQUEST_TIMEOUT_MS = 15_000

/** The server answered and said the login cannot succeed (expired code, access denied, ...). */
export class OAuthError extends Error {}

const randomDeviceId = (): string =>
  Array.from(
    { length: 10 },
    () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
  ).join('')

export async function requestDeviceCode(): Promise<DeviceCode> {
  const res = await fetch(`${OAUTH}/device/code`, {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      device_id: randomDeviceId(),
      device_name: 'trashee'
    })
  })
  const json = (await res.json()) as Record<string, string | number>
  if (!res.ok || !json.device_code)
    throw new OAuthError(`Не удалось получить код входа (${res.status})`)
  return {
    deviceCode: String(json.device_code),
    userCode: String(json.user_code),
    verificationUrl: String(json.verification_url),
    interval: Number(json.interval) || 5,
    expiresIn: Number(json.expires_in) || 300
  }
}

/**
 * Returns the access token, or null while the user has not confirmed the code yet.
 * Throws OAuthError when the login cannot succeed, and a plain error on network trouble (worth retrying).
 */
export async function pollDeviceToken(deviceCode: string): Promise<string | null> {
  const res = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: new URLSearchParams({
      grant_type: 'device_code',
      code: deviceCode,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  })
  const json = (await res.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (res.ok && json.access_token) return json.access_token
  if (json.error === 'authorization_pending' || json.error === 'slow_down') return null
  throw new OAuthError(json.error_description ?? json.error ?? `Ошибка входа (${res.status})`)
}
