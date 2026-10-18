import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/*
 * What the computer and the phone prove to each other on the home network.
 *
 * Pairing: the computer shows a short code. The phone sends HMAC(code, "pair|deviceId|nonce") instead of the code,
 * and gets the long-term token back XORed with HMAC(code, "tok|nonce"), so the code itself never travels.
 * After that every request is signed with the token: the token itself never travels either.
 */

const hmac = (key: string, data: string): Buffer => createHmac('sha256', key).update(data).digest()

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex')

export const randomHex = (bytes: number): string => randomBytes(bytes).toString('hex')

/** A code to type on the phone; leading zeros are kept. */
export function newPairingCode(): string {
  return String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, '0')
}

export const pairProof = (code: string, deviceId: string, nonce: string): string =>
  hmac(code, `pair|${deviceId}|${nonce}`).toString('hex')

/** XOR is its own inverse, so the same function wraps the token for the phone and unwraps it there. */
export function wrapToken(tokenHex: string, code: string, nonce: string): string {
  const key = hmac(code, `tok|${nonce}`)
  const token = Buffer.from(tokenHex, 'hex')
  return Buffer.from(token.map((byte, i) => byte ^ key[i % key.length])).toString('hex')
}

export function requestSignature(
  token: string,
  method: string,
  path: string,
  time: number,
  nonce: string,
  body: string
): string {
  return hmac(token, `${method}\n${path}\n${time}\n${nonce}\n${sha256Hex(body)}`).toString('hex')
}

/** Compares two hex strings without leaking where they differ. */
export function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}
