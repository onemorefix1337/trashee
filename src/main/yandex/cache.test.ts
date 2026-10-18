import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { TrackCache, chooseEvictions, parseRange, safeFileName, serveFile } from './cache.ts'

const KEY = '000102030405060708090a0b0c0d0e0f'
const plain = randomBytes(200_000)
const encrypted = (() => {
  const cipher = createCipheriv('aes-128-ctr', Buffer.from(KEY, 'hex'), Buffer.alloc(16))
  return Buffer.concat([cipher.update(plain), cipher.final()])
})()

let server: Server
let base = ''
let hits = 0

before(async () => {
  server = createServer((request, response) => {
    hits += 1
    const body = request.url === '/enc' ? encrypted : plain
    if (request.url === '/missing') {
      response.statusCode = 404
      response.end()
      return
    }
    response.setHeader('content-length', body.length)
    response.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => server.close())

function makeCache(limit = 10_000_000): { cache: TrackCache; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'trashee-cache-'))
  const cache = new TrackCache(root, {
    streamLimit: limit,
    resolve: async (id) =>
      id.startsWith('enc')
        ? { url: `${base}/enc`, codec: 'mp3', transport: 'encraw', key: KEY }
        : id === 'gone'
          ? { url: `${base}/missing`, codec: 'mp3', transport: 'raw' }
          : {
              url: `${base}/plain`,
              codec: id.startsWith('m4a') ? 'aac-mp4' : 'mp3',
              transport: 'raw'
            }
  })
  return { cache, root }
}

test('a plain track is downloaded once and found afterwards', async () => {
  const { cache, root } = makeCache()
  hits = 0
  assert.equal(cache.find('1', 'hq'), null)
  const first = await cache.download('1', 'hq', 'stream')
  assert.equal(readFileSync(first.file).equals(plain), true)
  assert.equal(first.place, 'stream')
  assert.equal(cache.find('1', 'hq')?.size, plain.length)
  await cache.download('1', 'hq', 'stream')
  assert.equal(hits, 1)
  rmSync(root, { recursive: true })
})

test('an encrypted track is decrypted on the way to the disk', async () => {
  const { cache, root } = makeCache()
  const saved = await cache.download('enc-7', 'hq', 'stream')
  assert.equal(readFileSync(saved.file).equals(plain), true)
  rmSync(root, { recursive: true })
})

test('the file extension follows the codec', async () => {
  const { cache, root } = makeCache()
  assert.match((await cache.download('m4a-1', 'hq', 'stream')).file, /\.m4a$/)
  assert.match((await cache.download('2', 'hq', 'stream')).file, /\.mp3$/)
  rmSync(root, { recursive: true })
})

test('two requests for the same track share one download', async () => {
  const { cache, root } = makeCache()
  hits = 0
  await Promise.all([cache.download('3', 'hq', 'stream'), cache.download('3', 'hq', 'stream')])
  assert.equal(hits, 1)
  rmSync(root, { recursive: true })
})

test('a failed download leaves nothing behind and can be retried', async () => {
  const { cache, root } = makeCache()
  await assert.rejects(cache.download('gone', 'hq', 'stream'), /404/)
  assert.equal(cache.find('gone', 'hq'), null)
  assert.equal(cache.sizes().stream, 0)
  rmSync(root, { recursive: true })
})

test('the automatic cache only counts for the quality being listened to; saved tracks for any', async () => {
  const { cache, root } = makeCache()
  await cache.download('4', 'hq', 'stream')
  assert.equal(cache.find('4', 'lossless'), null)
  await cache.download('5', 'nq', 'offline')
  assert.equal(cache.find('5', 'lossless')?.place, 'offline')
  assert.equal(cache.isSaved('5'), true)
  assert.equal(cache.isSaved('4'), false)
  rmSync(root, { recursive: true })
})

test('saving a track that is only in the automatic cache downloads it again into offline', async () => {
  const { cache, root } = makeCache()
  await cache.download('6', 'hq', 'stream')
  const saved = await cache.download('6', 'hq', 'offline')
  assert.equal(saved.place, 'offline')
  cache.clear('stream')
  assert.equal(cache.find('6', 'hq')?.place, 'offline')
  rmSync(root, { recursive: true })
})

test('the automatic cache drops its oldest tracks when it grows past the limit; offline is never touched', async () => {
  const { cache, root } = makeCache(plain.length * 2 + 10)
  await cache.download('old', 'hq', 'stream')
  const old = cache.find('old', 'hq')!
  utimesSync(old.file, new Date(2000, 0, 1), new Date(2000, 0, 1))
  await cache.download('keep', 'hq', 'offline')
  await cache.download('b', 'hq', 'stream')
  await cache.download('c', 'hq', 'stream')
  assert.equal(existsSync(old.file), false)
  assert.ok(cache.find('b', 'hq') && cache.find('c', 'hq'))
  assert.ok(cache.find('keep', 'hq'))
  rmSync(root, { recursive: true })
})

test('sizes, clearing and removing saved tracks', async () => {
  const { cache, root } = makeCache()
  await cache.download('x', 'hq', 'stream')
  await cache.download('y', 'hq', 'offline')
  const sizes = cache.sizes()
  assert.equal(sizes.stream, plain.length)
  assert.equal(sizes.offline, plain.length)
  assert.equal(sizes.offlineTracks, 1)
  cache.removeSaved('y')
  assert.equal(cache.sizes().offline, 0)
  cache.clear('stream')
  assert.equal(cache.sizes().stream, 0)
  rmSync(root, { recursive: true })
})

test('eviction picks the oldest files first and stops once under the limit', () => {
  const entries = [
    { file: 'a', size: 100, mtime: 3 },
    { file: 'b', size: 100, mtime: 1 },
    { file: 'c', size: 100, mtime: 2 }
  ]
  assert.deepEqual(chooseEvictions(entries, 1000), [])
  assert.deepEqual(chooseEvictions(entries, 250), ['b'])
  assert.deepEqual(chooseEvictions(entries, 120), ['b', 'c'])
  assert.deepEqual(chooseEvictions(entries, 0), ['b', 'c', 'a'])
})

test('Range headers are read the way HTTP defines them', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 })
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 })
  assert.deepEqual(parseRange('bytes=-200', 1000), { start: 800, end: 999 })
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, end: 999 })
  assert.equal(parseRange('bytes=1000-', 1000), null)
  assert.equal(parseRange('bytes=5-2', 1000), null)
  assert.equal(parseRange(null, 1000), null)
  assert.equal(parseRange('items=0-1', 1000), null)
})

test('a cached file is served whole or by range, like the network would', async () => {
  const { cache, root } = makeCache()
  const cached = await cache.download('8', 'hq', 'stream')
  const whole = serveFile(cached, null)
  assert.equal(whole.status, 200)
  assert.equal(whole.headers.get('content-type'), 'audio/mpeg')
  assert.equal(Buffer.from(await whole.arrayBuffer()).equals(plain), true)

  const part = serveFile(cached, 'bytes=100-199')
  assert.equal(part.status, 206)
  assert.equal(part.headers.get('content-range'), `bytes 100-199/${plain.length}`)
  assert.equal(Buffer.from(await part.arrayBuffer()).equals(plain.subarray(100, 200)), true)
  rmSync(root, { recursive: true })
})

test('file names lose characters that break paths', () => {
  assert.equal(safeFileName('AC/DC: Back In Black?'), 'AC DC Back In Black')
  assert.equal(safeFileName('  ...hidden.. '), 'hidden')
  assert.equal(safeFileName('???'), 'track')
  assert.equal(safeFileName('x'.repeat(300)).length, 120)
  assert.equal(safeFileName('Кино — Группа крови'), 'Кино — Группа крови')
})
