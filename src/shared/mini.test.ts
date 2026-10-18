import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_MINI_LOOK,
  MINI_LIMITS,
  MINI_LYRICS_HEIGHT,
  MINI_SIZE,
  anchorPosition,
  isMiniCommand,
  mergeMiniLook,
  miniArtSize,
  miniShortcut,
  miniWindowSize,
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

test('a damaged config falls back to the default anchor and look', () => {
  const defaults = { anchor: 'bc', ...DEFAULT_MINI_LOOK }
  assert.deepEqual(sanitizeMiniConfig(null), defaults)
  assert.deepEqual(sanitizeMiniConfig({ anchor: 'nope' }), defaults)
  assert.deepEqual(sanitizeMiniConfig({ anchor: 'bc', custom: { x: 'a', y: 2 } }), defaults)
  assert.deepEqual(sanitizeMiniConfig({ anchor: 'bc', width: 'wide', opacity: null }), defaults)
})

test('a dragged position is kept and rounded', () => {
  assert.deepEqual(sanitizeMiniConfig({ anchor: 'tl', custom: { x: 10.4, y: 99.6 } }), {
    anchor: 'tl',
    ...DEFAULT_MINI_LOOK,
    custom: { x: 10, y: 100 }
  })
})

test('an old config without the look keeps its anchor and gets the default look', () => {
  assert.deepEqual(sanitizeMiniConfig({ anchor: 'tr' }), { anchor: 'tr', ...DEFAULT_MINI_LOOK })
})

test('size and opacity stay inside their limits', () => {
  const huge = mergeMiniLook(DEFAULT_MINI_LOOK, { width: 5000, height: 5000, opacity: 7 })
  assert.equal(huge.width, MINI_LIMITS.width.max)
  assert.equal(huge.height, MINI_LIMITS.height.max)
  assert.equal(huge.opacity, MINI_LIMITS.opacity.max)
  const tiny = mergeMiniLook(DEFAULT_MINI_LOOK, { width: 1, height: -3, opacity: 0 })
  assert.equal(tiny.width, MINI_LIMITS.width.min)
  assert.equal(tiny.height, MINI_LIMITS.height.min)
  assert.equal(tiny.opacity, MINI_LIMITS.opacity.min)
})

test('a patch changes only what it names and ignores nonsense', () => {
  const wide = mergeMiniLook(DEFAULT_MINI_LOOK, { width: 500.4, lyrics: true })
  assert.deepEqual(wide, { ...DEFAULT_MINI_LOOK, width: 500, lyrics: true })
  assert.deepEqual(mergeMiniLook(wide, { height: 'tall', lyrics: 'yes', opacity: NaN }), wide)
  assert.deepEqual(mergeMiniLook(wide, null), wide)
  assert.equal(mergeMiniLook(DEFAULT_MINI_LOOK, { opacity: 0.456 }).opacity, 0.46)
})

test('the window is taller by one line of the lyrics only while it is open', () => {
  assert.deepEqual(miniWindowSize(DEFAULT_MINI_LOOK), MINI_SIZE)
  assert.deepEqual(miniWindowSize({ ...DEFAULT_MINI_LOOK, lyrics: true }), {
    width: MINI_SIZE.width,
    height: MINI_SIZE.height + MINI_LYRICS_HEIGHT
  })
})

test('the cover follows the height of the card within sensible bounds', () => {
  assert.equal(miniArtSize(MINI_SIZE.height), 84)
  assert.equal(miniArtSize(MINI_LIMITS.height.min), 56)
  assert.equal(miniArtSize(MINI_LIMITS.height.max), 140)
  assert.equal(miniArtSize(10), 56)
  assert.equal(miniArtSize(900), 140)
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
  assert.equal(track?.line, '')
  assert.equal('extra' in (track ?? {}), false)
})

test('the lyric line is kept, trimmed to a sane length', () => {
  assert.equal(sanitizeMiniTrack({ title: 'a', line: 'Строка текста' })?.line, 'Строка текста')
  assert.equal(sanitizeMiniTrack({ title: 'a', line: 'x'.repeat(1000) })?.line.length, 300)
  assert.equal(sanitizeMiniTrack({ title: 'a', line: 7 })?.line, '')
})

test('Windows has its own shortcut for the mini player, everyone else keeps the old one', () => {
  assert.deepEqual(miniShortcut('win32'), {
    accelerator: 'Control+Shift+1',
    label: 'Ctrl + Shift + 1'
  })
  assert.equal(miniShortcut('darwin').accelerator, 'CommandOrControl+Alt+M')
  assert.equal(miniShortcut('linux').accelerator, 'CommandOrControl+Alt+M')
})
