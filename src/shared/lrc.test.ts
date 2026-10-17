import assert from 'node:assert/strict'
import test from 'node:test'
import { activeLine, parseLrc } from './lrc.ts'

test('parses stamps with different precision and sorts by time', () => {
  const lines = parseLrc('[00:12.5]second\n[00:03]first\n[01:02.345]third\n[00:20.50]fourth')
  assert.deepEqual(lines, [
    { time: 3, text: 'first' },
    { time: 12.5, text: 'second' },
    { time: 20.5, text: 'fourth' },
    { time: 62.345, text: 'third' }
  ])
})

test('a repeated chorus carries several stamps on one line', () => {
  const lines = parseLrc('[00:10.00][00:50.00]chorus\n[00:30.00]verse')
  assert.deepEqual(
    lines.map((line) => [line.time, line.text]),
    [
      [10, 'chorus'],
      [30, 'verse'],
      [50, 'chorus']
    ]
  )
})

test('metadata tags and unstamped lines are ignored, empty lines keep their gap', () => {
  const source = [
    '[ar:Artist]',
    '[ti:Title]',
    '[length: 03:45]',
    'just text',
    '[00:05.00]',
    '[00:07.00]sung'
  ].join('\r\n')
  assert.deepEqual(parseLrc(source), [
    { time: 5, text: '' },
    { time: 7, text: 'sung' }
  ])
})

test('the offset tag shifts every line and never goes below zero', () => {
  assert.deepEqual(parseLrc('[offset:+500]\n[00:01.00]a\n[00:10.00]b'), [
    { time: 0.5, text: 'a' },
    { time: 9.5, text: 'b' }
  ])
  assert.equal(parseLrc('[offset:5000]\n[00:01.00]a')[0].time, 0)
})

test('nothing parseable gives an empty list', () => {
  assert.deepEqual(parseLrc(''), [])
  assert.deepEqual(parseLrc('only words\nno stamps'), [])
})

test('activeLine finds the line being sung', () => {
  const lines = [
    { time: 5, text: 'a' },
    { time: 10, text: 'b' },
    { time: 15, text: 'c' }
  ]
  assert.equal(activeLine(lines, 0), -1)
  assert.equal(activeLine(lines, 4.99), -1)
  assert.equal(activeLine(lines, 5), 0)
  assert.equal(activeLine(lines, 12), 1)
  assert.equal(activeLine(lines, 15), 2)
  assert.equal(activeLine(lines, 999), 2)
  assert.equal(activeLine([], 3), -1)
})
