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

/** Runs `body` with fetch replaced by a handler that sees every request the client makes. */
async function withFetch(
  handler: (url: URL, init: RequestInit) => { status?: number; body: unknown },
  body: (requests: { url: URL; init: RequestInit }[]) => Promise<void>
): Promise<void> {
  const realFetch = globalThis.fetch
  const requests: { url: URL; init: RequestInit }[] = []
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input))
    requests.push({ url, init })
    const reply = handler(url, init)
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 })
  }) as typeof fetch
  try {
    await body(requests)
  } finally {
    globalThis.fetch = realFetch
  }
}

const formOf = (init: RequestInit): URLSearchParams => init.body as URLSearchParams

test("a new playlist is created private and comes back as the user's own", async () => {
  const { YandexMusic } = await import('./client.ts')
  await withFetch(
    (url) =>
      url.pathname === '/account/status'
        ? { body: { result: { account: { uid: 7, login: 'mira' } } } }
        : { body: { result: { uid: 7, kind: 1003, title: 'Дорога', trackCount: 0, revision: 1 } } },
    async (requests) => {
      const info = await new YandexMusic('t').createPlaylist('Дорога')
      assert.equal(info.title, 'Дорога')
      assert.equal(info.mine, true)
      const create = requests.find((r) => r.url.pathname === '/users/7/playlists/create')
      assert.ok(create)
      assert.equal(formOf(create.init).get('title'), 'Дорога')
      assert.equal(formOf(create.init).get('visibility'), 'private')
    }
  )
})

test('adding a track reads the playlist, then inserts at its end with the revision it saw', async () => {
  const { YandexMusic } = await import('./client.ts')
  await withFetch(
    (url) => {
      if (url.pathname === '/account/status') return { body: { result: { account: { uid: 7 } } } }
      if (url.pathname.endsWith('/change')) return { body: { result: { revision: 5 } } }
      return {
        body: { result: { revision: 4, trackCount: 2, tracks: [{ id: 10 }, { id: '11:3' }] } }
      }
    },
    async (requests) => {
      const outcome = await new YandexMusic('t').addToPlaylist(1003, { id: '99', albumId: 5 })
      assert.equal(outcome, 'added')
      const change = requests.find((r) => r.url.pathname === '/users/7/playlists/1003/change')
      assert.ok(change)
      const form = formOf(change.init)
      assert.equal(form.get('kind'), '1003')
      assert.equal(form.get('revision'), '4')
      assert.deepEqual(JSON.parse(form.get('diff') ?? ''), [
        { op: 'insert', at: 2, tracks: [{ id: '99', albumId: 5 }] }
      ])
    }
  )
})

test('a track that is already in the playlist is not added twice', async () => {
  const { YandexMusic } = await import('./client.ts')
  await withFetch(
    (url) =>
      url.pathname === '/account/status'
        ? { body: { result: { account: { uid: 7 } } } }
        : { body: { result: { revision: 4, trackCount: 1, tracks: [{ id: '11:3' }] } } },
    async (requests) => {
      assert.equal(await new YandexMusic('t').addToPlaylist(1003, { id: '11' }), 'exists')
      assert.equal(
        requests.some((r) => r.url.pathname.endsWith('/change')),
        false
      )
    }
  )
})

test('a playlist changed by another device is read again and the change is retried once', async () => {
  const { YandexMusic } = await import('./client.ts')
  let changes = 0
  await withFetch(
    (url) => {
      if (url.pathname === '/account/status') return { body: { result: { account: { uid: 7 } } } }
      if (url.pathname.endsWith('/change')) {
        changes += 1
        return changes === 1
          ? { status: 412, body: { error: { message: 'wrong-revision' } } }
          : { body: { result: { revision: 6 } } }
      }
      return { body: { result: { revision: changes === 0 ? 4 : 5, trackCount: 0, tracks: [] } } }
    },
    async (requests) => {
      assert.equal(await new YandexMusic('t').addToPlaylist(1003, { id: '1' }), 'added')
      const sent = requests.filter((r) => r.url.pathname.endsWith('/change'))
      assert.equal(sent.length, 2)
      assert.equal(formOf(sent[1].init).get('revision'), '5')
    }
  )
})

test('a failure that is not about the revision is not retried', async () => {
  const { YandexMusic } = await import('./client.ts')
  let changes = 0
  await withFetch(
    (url) => {
      if (url.pathname === '/account/status') return { body: { result: { account: { uid: 7 } } } }
      if (url.pathname.endsWith('/change')) {
        changes += 1
        return { status: 500, body: { error: { message: 'boom' } } }
      }
      return { body: { result: { revision: 1, trackCount: 0, tracks: [] } } }
    },
    async () => {
      await assert.rejects(new YandexMusic('t').addToPlaylist(1003, { id: '1' }), /boom/)
      assert.equal(changes, 1)
    }
  )
})
