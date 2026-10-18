import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MINI_SIZE,
  anchorPosition,
  isMiniCommand,
  sanitizeMiniConfig,
  sanitizeMiniTrack
} from './mini.ts'

const area = { x: 0, y: 0, width: 1920, height: 1040 }

test('anchors put the card in the right corner or middle of the work area', () => {
  assert.deepEqual(anchorPosition('tl', area), { x: 32, y: 32 })
  assert.deepEqual(anchorPosition('tr', area), { x: 1920 - MINI_SIZE.width - 32, y: 32 })
  assert.deepEqual(anchorPosition('bl', area), { x: 32, y: 1040 - MINI_SIZE.height - 32 })
  assert.deepEqual(anchorPosition('bc', area), {
    x: (1920 - MINI_SIZE.width) / 2,
    y: 1040 - MINI_SIZE.height - 32
  })
  assert.equal(anchorPosition('tc', area).y, 32)
})

test('anchors respect the origin of a second monitor and the menu bar', () => {
  const second = { x: 1920, y: 25, width: 1440, height: 875 }
  assert.deepEqual(anchorPosition('tl', second), { x: 1952, y: 57 })
  assert.equal(anchorPosition('br', second).x, 1920 + 1440 - MINI_SIZE.width - 32)
})

test('a damaged config falls back to the default anchor', () => {
  assert.deepEqual(sanitizeMiniConfig(null), { anchor: 'bc' })
  assert.deepEqual(sanitizeMiniConfig({ anchor: 'nope' }), { anchor: 'bc' })
  assert.deepEqual(sanitizeMiniConfig({ anchor: 'tr', custom: { x: 'a', y: 2 } }), { anchor: 'tr' })
})

test('a dragged position is kept and rounded', () => {
  assert.deepEqual(sanitizeMiniConfig({ anchor: 'tl', custom: { x: 10.4, y: 99.6 } }), {
    anchor: 'tl',
    custom: { x: 10, y: 100 }
  })
})

test('only known commands are accepted', () => {
  assert.equal(isMiniCommand('toggle'), true)
  assert.equal(isMiniCommand('open'), true)
  assert.equal(isMiniCommand('quit'), false)
  assert.equal(isMiniCommand(undefined), false)
})

test('track state is reduced to plain, bounded fields', () => {
  assert.equal(sanitizeMiniTrack(null), null)
  assert.equal(sanitizeMiniTrack({ artist: 'x' }), null)
  const track = sanitizeMiniTrack({
    title: 'a'.repeat(1000),
    artist: 5,
    coverUri: 'avatars.yandex.net/get-music-content/1/%%',
    playing: 'yes',
    liked: true,
    extra: 'dropped'
  })
  assert.equal(track?.title.length, 300)
  assert.equal(track?.artist, '')
  assert.equal(track?.playing, false)
  assert.equal(track?.liked, true)
  assert.equal('extra' in (track ?? {}), false)
})
