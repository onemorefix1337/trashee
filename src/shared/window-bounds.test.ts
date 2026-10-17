import assert from 'node:assert/strict'
import test from 'node:test'
import { restoreBounds } from './window-bounds.ts'

const screens = [{ x: 0, y: 0, width: 1920, height: 1080 }]
const fallback = { width: 1180, height: 780 }
const min = { width: 860, height: 600 }

test('a saved window that is still on screen is kept as it was', () => {
  const saved = { x: 100, y: 80, width: 1000, height: 700, maximized: true }
  assert.deepEqual(restoreBounds(saved, screens, fallback, min), saved)
})

test('a window saved on a monitor that is gone loses its position but keeps its size', () => {
  const saved = { x: 2500, y: 100, width: 1000, height: 700, maximized: false }
  assert.deepEqual(restoreBounds(saved, screens, fallback, min), {
    width: 1000,
    height: 700,
    maximized: false
  })
})

test('a window that only just touches a screen counts as lost', () => {
  const saved = { x: 1900, y: 1060, width: 1000, height: 700 }
  assert.equal(restoreBounds(saved, screens, fallback, min).x, undefined)
})

test('a window spread over two screens is fine while enough of it is visible', () => {
  const two = [...screens, { x: 1920, y: 0, width: 1920, height: 1080 }]
  const saved = { x: 1500, y: 100, width: 1000, height: 700 }
  assert.equal(restoreBounds(saved, two, fallback, min).x, 1500)
})

test('garbage falls back to the default size, tiny sizes are raised to the minimum', () => {
  assert.deepEqual(restoreBounds(null, screens, fallback, min), { ...fallback, maximized: false })
  assert.deepEqual(restoreBounds('x', screens, fallback, min), { ...fallback, maximized: false })
  assert.deepEqual(restoreBounds({ width: 100, height: 50 }, screens, fallback, min), {
    ...min,
    maximized: false
  })
  assert.deepEqual(restoreBounds({ x: NaN, y: 1, width: 'wide' }, screens, fallback, min), {
    ...fallback,
    maximized: false
  })
})
