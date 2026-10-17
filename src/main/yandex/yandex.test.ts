import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import test from 'node:test'
import { OAuthError, pollDeviceToken } from './auth.ts'
import { YandexMusicError, isAuthFailure } from './errors.ts'
import { fileInfoSign, lyricsSign } from './sign.ts'
import { decryptFrom } from './decrypt.ts'

test('fileInfoSign matches the reference implementation', () => {
  const realNow = Date.now
  Date.now = () => 1_700_000_000_000
  try {
    const { ts, sign } = fileInfoSign('12345', 'lossless', ['flac', 'aac', 'mp3'], 'raw')
    assert.equal(ts, 1_700_000_000)
    assert.equal(sign, 'yTjb4CS4sKiEM6BL3PpBEf3HTT5qXG30/fA+fVpacao')
  } finally {
    Date.now = realNow
  }
})

test('decryptFrom decrypts from any byte offset', async () => {
  const key = randomBytes(16)
  const plain = randomBytes(1000)
  const cipher = createCipheriv('aes-128-ctr', key, Buffer.alloc(16))
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])

  for (const offset of [0, 1, 15, 16, 37, 512, 999]) {
    const source = new Blob([encrypted.subarray(offset)]).stream() as ReadableStream<Uint8Array>
    const out = await new Response(
      source.pipeThrough(decryptFrom(key.toString('hex'), offset))
    ).arrayBuffer()
    assert.deepEqual(Buffer.from(out), plain.subarray(offset), `offset ${offset}`)
  }
})

test('only rejected credentials count as an auth failure', () => {
  assert.equal(isAuthFailure(new YandexMusicError('rejected', 401)), true)
  assert.equal(isAuthFailure(new YandexMusicError('rejected', 403)), true)
  for (const status of [451, 500, 503, undefined]) {
    assert.equal(isAuthFailure(new YandexMusicError('unreachable', status)), false, String(status))
  }
  assert.equal(isAuthFailure(new TypeError('fetch failed')), false)
})

test('pollDeviceToken tells "not yet" from "never" from "network down"', async () => {
  const realFetch = globalThis.fetch
  const reply =
    (status: number, body: object): typeof fetch =>
    async () =>
      new Response(JSON.stringify(body), { status })
  try {
    globalThis.fetch = reply(200, { access_token: 'secret' })
    assert.equal(await pollDeviceToken('code'), 'secret')

    globalThis.fetch = reply(400, { error: 'authorization_pending' })
    assert.equal(await pollDeviceToken('code'), null)

    globalThis.fetch = reply(400, { error: 'slow_down' })
    assert.equal(await pollDeviceToken('code'), null)

    globalThis.fetch = reply(400, { error: 'expired_token' })
    await assert.rejects(pollDeviceToken('code'), OAuthError)

    globalThis.fetch = async () => {
      throw new TypeError('fetch failed')
    }
    await assert.rejects(
      pollDeviceToken('code'),
      (error: unknown) => !(error instanceof OAuthError)
    )
  } finally {
    globalThis.fetch = realFetch
  }
})

test('lyricsSign matches the reference implementation and ignores the album part of an id', () => {
  const realNow = Date.now
  Date.now = () => 1_700_000_000_000
  try {
    const expected = 'Ucx7ny+5EZuyvj1G6+agFdud6MV8nQXkvdrNs95cyEM='
    assert.equal(lyricsSign('12345').sign, expected)
    assert.equal(lyricsSign('12345:678').sign, expected)
    assert.equal(lyricsSign('12345').ts, 1_700_000_000)
  } finally {
    Date.now = realNow
  }
})
