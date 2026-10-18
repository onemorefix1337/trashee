import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_SETTINGS,
  EQ_BANDS,
  EQ_PRESETS,
  closeToTrayOn,
  sanitizeSettings
} from './settings.ts'

test('garbage falls back to the defaults', () => {
  for (const junk of [
    null,
    undefined,
    42,
    'text',
    [],
    { quality: 'ultra', motion: 7, speed: 'fast' }
  ]) {
    assert.deepEqual(sanitizeSettings(junk), DEFAULT_SETTINGS)
  }
})

test('valid settings survive a round trip', () => {
  const saved = {
    quality: 'lossless',
    motion: 'reduced',
    visualizer: false,
    dynamicColors: false,
    sidebarCollapsed: true,
    closeToTray: false,
    discord: true,
    prefetchNext: false,
    speed: 1.25,
    eqPreset: 'bass',
    eqGains: EQ_PRESETS[1].gains
  }
  assert.deepEqual(sanitizeSettings(JSON.parse(JSON.stringify(saved))), saved)
})

test('equalizer gains are clamped and must cover every band', () => {
  const loud = sanitizeSettings({ eqGains: EQ_BANDS.map(() => 99) })
  assert.ok(loud.eqGains.every((gain) => gain === 12))

  assert.deepEqual(sanitizeSettings({ eqGains: [1, 2, 3] }).eqGains, DEFAULT_SETTINGS.eqGains)
  assert.deepEqual(
    sanitizeSettings({ eqGains: EQ_BANDS.map(() => 'x') }).eqGains,
    DEFAULT_SETTINGS.eqGains
  )
})

test('playback speed is kept in a sane range', () => {
  assert.equal(sanitizeSettings({ speed: 100 }).speed, 3)
  assert.equal(sanitizeSettings({ speed: 0 }).speed, 0.5)
  assert.equal(sanitizeSettings({ speed: NaN }).speed, 1)
})

test('every preset has one gain per band', () => {
  for (const preset of EQ_PRESETS) assert.equal(preset.gains.length, EQ_BANDS.length, preset.id)
})

test('fetching the next track ahead is on unless the user turned it off', () => {
  assert.equal(sanitizeSettings({}).prefetchNext, true)
  assert.equal(sanitizeSettings({ prefetchNext: false }).prefetchNext, false)
  assert.equal(sanitizeSettings({ prefetchNext: 'no' }).prefetchNext, true)
})

test('closing to the tray follows the choice, and without one it is on except on Linux', () => {
  assert.equal(closeToTrayOn(null, 'darwin'), true)
  assert.equal(closeToTrayOn(null, 'win32'), true)
  assert.equal(closeToTrayOn(null, 'linux'), false)
  assert.equal(closeToTrayOn(false, 'darwin'), false)
  assert.equal(closeToTrayOn(true, 'linux'), true)
  assert.equal(sanitizeSettings({ closeToTray: 'yes' }).closeToTray, null)
})
