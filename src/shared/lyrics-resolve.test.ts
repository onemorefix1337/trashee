import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LRCLIB_SOURCE,
  OVH_SOURCE,
  YANDEX_SOURCE,
  resolveLyrics,
  type LyricsProvider
} from './lyrics-resolve.ts'
import type { Lyrics, LyricsQuery } from './types.ts'

const query: LyricsQuery = { id: '1', title: 'T', artists: ['A'], durationSec: 100 }
const synced = (source = LRCLIB_SOURCE): Lyrics => ({
  synced: [{ time: 1, text: 'x' }],
  text: null,
  source
})
const plain = (source = LRCLIB_SOURCE): Lyrics => ({ synced: null, text: 'words', source })
const none: Lyrics = { synced: null, text: null, source: null }

function provider(
  result: Lyrics | null | Error,
  canSync = true
): { found: LyricsProvider; calls: number[] } {
  const calls: number[] = []
  const found: LyricsProvider = {
    canSync,
    async find() {
      calls.push(1)
      if (result instanceof Error) throw result
      return result
    }
  }
  return { found, calls }
}

test('synced lyrics from Yandex end the search', async () => {
  const open = provider(synced())
  const result = await resolveLyrics(query, async () => synced(YANDEX_SOURCE), [open.found])
  assert.equal(result.source, YANDEX_SOURCE)
  assert.equal(open.calls.length, 0)
})

test('without Yandex lyrics the first open source with a text is used', async () => {
  const first = provider(null)
  const second = provider(synced())
  const result = await resolveLyrics(query, async () => none, [first.found, second.found])
  assert.equal(result.source, LRCLIB_SOURCE)
  assert.ok(result.synced)
  assert.equal(first.calls.length, 1)
})

test('plain Yandex text is upgraded to synced text from an open source', async () => {
  const open = provider(synced())
  const result = await resolveLyrics(query, async () => plain(YANDEX_SOURCE), [open.found])
  assert.ok(result.synced)
})

test('plain Yandex text is kept when open sources have nothing better, and plain-only sources are not asked', async () => {
  const lrclib = provider(plain())
  const ovh = provider(plain(OVH_SOURCE), false)
  const result = await resolveLyrics(query, async () => plain(YANDEX_SOURCE), [
    lrclib.found,
    ovh.found
  ])
  assert.equal(result.source, YANDEX_SOURCE)
  assert.equal(ovh.calls.length, 0)
})

test('plain-only sources are asked when nothing else had a text', async () => {
  const lrclib = provider(null)
  const ovh = provider(plain(OVH_SOURCE), false)
  const result = await resolveLyrics(query, async () => none, [lrclib.found, ovh.found])
  assert.equal(result.source, OVH_SOURCE)
})

test('a broken open source is skipped, not fatal', async () => {
  const broken = provider(new Error('offline'))
  const ok = provider(plain())
  const result = await resolveLyrics(query, async () => none, [broken.found, ok.found])
  assert.equal(result.text, 'words')
})

test('a failing Yandex request still falls back to open sources', async () => {
  const open = provider(plain())
  const result = await resolveLyrics(query, async () => {
    throw new Error('network')
  }, [open.found])
  assert.equal(result.source, LRCLIB_SOURCE)
})

test('Yandex failing and nothing found elsewhere passes the failure on, so a retry can be offered', async () => {
  await assert.rejects(
    resolveLyrics(query, async () => {
      throw new Error('network')
    }, [provider(null).found]),
    /network/
  )
})

test('no text anywhere is an empty result; an instrumental is reported as such', async () => {
  assert.deepEqual(await resolveLyrics(query, async () => none, [provider(null).found]), none)
  const result = await resolveLyrics(query, async () => none, [
    provider({ synced: null, text: null, source: LRCLIB_SOURCE, instrumental: true }).found
  ])
  assert.equal(result.instrumental, true)
})
