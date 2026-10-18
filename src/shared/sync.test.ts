import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HANDOFF_AHEAD,
  HANDOFF_BEHIND,
  estimatePositionMs,
  handoffWindow,
  sanitizeHandoff,
  sanitizeNowPlaying,
  sanitizeSyncCommand,
  sanitizeSyncTrack,
  type NowPlaying
} from './sync.ts'

const track = { id: '1', title: 'Стеклянный город', artist: 'Аврора Блу', durationMs: 200_000 }

test('a track needs an id; the rest is bounded and optional parts are left out', () => {
  assert.equal(sanitizeSyncTrack(null), null)
  assert.equal(sanitizeSyncTrack({ title: 'x' }), null)
  assert.deepEqual(sanitizeSyncTrack({ ...track, extra: 'dropped' }), track)
  const long = sanitizeSyncTrack({
    ...track,
    title: 'x'.repeat(1000),
    coverUri: 'c/%%',
    albumId: 5.4
  })
  assert.equal(long?.title.length, 300)
  assert.equal(long?.coverUri, 'c/%%')
  assert.equal(long?.albumId, 5)
})

test('the sender of a state is the connection, not what the body says', () => {
  const state = sanitizeNowPlaying(
    { device: 'liar', name: 'x', track, playing: true, positionMs: 1234.6, at: 99 },
    'dev-1',
    'Pixel'
  )
  assert.equal(state.device, 'dev-1')
  assert.equal(state.name, 'Pixel')
  assert.equal(state.positionMs, 1235)
  assert.equal(state.playing, true)
  assert.deepEqual(sanitizeNowPlaying(null, 'd', 'n').track, null)
  assert.equal(sanitizeNowPlaying({ playing: 'yes', positionMs: -5 }, 'd', 'n').positionMs, 0)
})

test('a handoff needs a queue; the index stays inside it and strangers are cut out', () => {
  assert.equal(sanitizeHandoff(null, 'a', 'A'), null)
  assert.equal(sanitizeHandoff({ queue: [] }, 'a', 'A'), null)
  assert.equal(sanitizeHandoff({ queue: [1, 2] }, 'a', 'A'), null)
  const handoff = sanitizeHandoff(
    { queue: ['1', '2', 3, '4'], index: 99, positionMs: 5000, tracks: [track, 'bad'] },
    'a',
    'A'
  )
  assert.deepEqual(handoff?.queue, ['1', '2', '4'])
  assert.equal(handoff?.index, 2)
  assert.equal(handoff?.tracks.length, 1)
  assert.equal(handoff?.from, 'a')
  assert.equal(handoff?.playing, true)
  const huge = Array.from({ length: HANDOFF_BEHIND + HANDOFF_AHEAD + 2 }, (_, i) => String(i))
  assert.equal(sanitizeHandoff({ queue: huge }, 'a', 'A'), null)
})

test('only known commands pass, with their value kept in range', () => {
  assert.deepEqual(sanitizeSyncCommand({ cmd: 'toggle' }), { cmd: 'toggle' })
  assert.deepEqual(sanitizeSyncCommand({ cmd: 'seek', value: 12000.4 }), {
    cmd: 'seek',
    value: 12000
  })
  assert.deepEqual(sanitizeSyncCommand({ cmd: 'volume', value: 7 }), { cmd: 'volume', value: 1 })
  assert.deepEqual(sanitizeSyncCommand({ cmd: 'volume', value: -1 }), { cmd: 'volume', value: 0 })
  assert.equal(sanitizeSyncCommand({ cmd: 'format-disk' }), null)
  assert.equal(sanitizeSyncCommand('toggle'), null)
})

test('a playing track keeps moving after its state was sent, a paused one does not', () => {
  const base: NowPlaying = {
    device: 'd',
    name: 'n',
    track,
    playing: true,
    positionMs: 10_000,
    at: 1_000,
    queueLength: 3,
    index: 0
  }
  assert.equal(estimatePositionMs(base, 3_500), 12_500)
  assert.equal(estimatePositionMs({ ...base, playing: false }, 3_500), 10_000)
  assert.equal(estimatePositionMs(base, 999_999_999), 200_000)
  assert.equal(estimatePositionMs({ ...base, track: null }, 5_000), 0)
  assert.equal(estimatePositionMs(base, 3_500, 500), 12_000)
})

test('a handoff carries the last few played tracks and the next ones', () => {
  const queue = Array.from({ length: 500 }, (_, i) => `t${i}`)
  const middle = handoffWindow(queue, 200)
  assert.equal(middle.items[middle.index], 't200')
  assert.equal(middle.items.length, HANDOFF_BEHIND + HANDOFF_AHEAD + 1)
  const start = handoffWindow(queue, 1)
  assert.equal(start.index, 1)
  assert.equal(start.items[0], 't0')
  const end = handoffWindow(queue, 499)
  assert.equal(end.items[end.index], 't499')
  assert.equal(end.items.length, HANDOFF_BEHIND + 1)
  assert.deepEqual(handoffWindow(['a'], 0), { items: ['a'], index: 0 })
})
