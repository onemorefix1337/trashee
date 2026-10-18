import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SLEEP_MINUTES, fadeLevel, formatRemaining } from './sleep.ts'

test('the fade starts at full volume, ends in silence and never goes back up', () => {
  assert.equal(fadeLevel(0, 15000), 1)
  assert.equal(fadeLevel(15000, 15000), 0)
  assert.equal(fadeLevel(99999, 15000), 0)
  assert.equal(fadeLevel(-5, 15000), 1)
  let last = 1
  for (let ms = 0; ms <= 15000; ms += 500) {
    const level = fadeLevel(ms, 15000)
    assert.ok(level <= last)
    last = level
  }
})

test('the fade is gentler than a straight line at first', () => {
  assert.ok(fadeLevel(7500, 15000) < 0.5)
  assert.equal(fadeLevel(7500, 15000), 0.25)
})

test('a fade of no length is silence at once', () => {
  assert.equal(fadeLevel(0, 0), 0)
})

test('the time left is written as minutes and seconds, with hours only when needed', () => {
  assert.equal(formatRemaining(0), '0:00')
  assert.equal(formatRemaining(999), '0:01')
  assert.equal(formatRemaining(30 * 60 * 1000), '30:00')
  assert.equal(formatRemaining(61 * 1000), '1:01')
  assert.equal(formatRemaining(65 * 60 * 1000 + 5000), '1:05:05')
  assert.equal(formatRemaining(-4000), '0:00')
})

test('the choices go from short to long', () => {
  assert.deepEqual(
    [...SLEEP_MINUTES].sort((a, b) => a - b),
    SLEEP_MINUTES
  )
})
