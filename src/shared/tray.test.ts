import assert from 'node:assert/strict'
import { test } from 'node:test'
import { barsBitmap, trayEntries } from './tray.ts'

const track = {
  title: 'Стеклянный город',
  artist: 'Аврора Блу',
  playing: true,
  liked: false,
  line: ''
}

test('with nothing playing the controls are off', () => {
  const entries = trayEntries(null, true, false)
  assert.equal(entries[0].label, 'Ничего не играет')
  for (const id of ['toggle', 'prev', 'next'])
    assert.equal(entries.find((entry) => entry.id === id)?.enabled, false)
  assert.equal(entries.find((entry) => entry.id === 'quit')?.enabled, undefined)
})

test('the menu follows what is playing and what is shown', () => {
  const entries = trayEntries(track, false, true)
  assert.equal(entries[0].label, 'Стеклянный город — Аврора Блу')
  assert.equal(entries.find((entry) => entry.id === 'toggle')?.label, 'Пауза')
  assert.equal(entries.find((entry) => entry.id === 'show')?.label, 'Показать окно')
  assert.equal(entries.find((entry) => entry.id === 'mini')?.label, 'Скрыть мини-плеер')
  const paused = trayEntries({ ...track, playing: false }, true, false)
  assert.equal(paused.find((entry) => entry.id === 'toggle')?.label, 'Играть')
  assert.equal(paused.find((entry) => entry.id === 'show')?.label, 'Спрятать окно')
})

test('a long title is cut so the menu stays narrow', () => {
  const long = trayEntries({ ...track, title: 'очень '.repeat(30) }, true, false)[0].label ?? ''
  assert.ok(long.length <= 42)
  assert.ok(long.endsWith('…'))
})

test('the icon is a square bitmap with the bars opaque in the middle and clear in the corners', () => {
  for (const size of [16, 22, 32]) {
    const { data, width, height } = barsBitmap(size, () => [10, 20, 30])
    assert.equal(width, size)
    assert.equal(height, size)
    assert.equal(data.length, size * size * 4)
    assert.equal(data[3], 0)
    const alphaAt = (x: number, y: number): number => data[(y * size + x) * 4 + 3]
    assert.equal(alphaAt(Math.floor(size / 2), Math.floor(size / 2)), 255)
    assert.equal(alphaAt(size - 1, size - 1), 0)
  }
})

test('colors are stored premultiplied, in blue-green-red order', () => {
  const { data, width } = barsBitmap(32, () => [200, 100, 50])
  const at = (Math.floor(32 / 2) * width + Math.floor(32 / 2)) * 4
  assert.deepEqual([data[at], data[at + 1], data[at + 2], data[at + 3]], [50, 100, 200, 255])
})
