import assert from 'node:assert/strict'
import { test } from 'node:test'
import { insertedAt, jumpedTo, shuffled, startRun, stepBack, stepForward } from './shuffle.ts'
import type { ShuffleRun } from './shuffle.ts'

/** A repeatable stand-in for Math.random. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

/** Plays the queue to the end of the pass, following the run. */
function playPass(count: number, start: number, random: () => number): number[] {
  let run = startRun(count, start, random)
  const heard = [start]
  let current = start
  for (;;) {
    const step = stepForward(run, current, count, false, random)
    if (step.target === null) return heard
    heard.push(step.target)
    current = step.target
    run = step.run
  }
}

test('shuffling keeps every item and loses none', () => {
  const items = Array.from({ length: 50 }, (_, i) => i)
  assert.deepEqual(
    shuffled(items, seeded(7)).sort((a, b) => a - b),
    items
  )
})

test('a pass plays every track exactly once, starting with the one that is playing', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const start = seed % 20
    const heard = playPass(20, start, seeded(seed))
    assert.equal(heard[0], start)
    assert.equal(heard.length, 20)
    assert.deepEqual(
      [...heard].sort((a, b) => a - b),
      Array.from({ length: 20 }, (_, i) => i)
    )
  }
})

test('without looping the pass ends; with looping a new one begins and never repeats the last track at once', () => {
  const random = seeded(3)
  let run = startRun(4, 0, random)
  let current = 0
  for (let i = 0; i < 3; i++) {
    const step = stepForward(run, current, 4, false, random)
    assert.notEqual(step.target, null)
    run = step.run
    current = step.target as number
  }
  assert.equal(stepForward(run, current, 4, false, random).target, null)
  for (let round = 0; round < 50; round++) {
    const step = stepForward(run, current, 4, true, random)
    assert.notEqual(step.target, null)
    assert.notEqual(step.target, current)
    run = step.run
    current = step.target as number
  }
})

test('one track alone has nothing to shuffle to, looping or not', () => {
  const run = startRun(1, 0)
  assert.equal(stepForward(run, 0, 1, true).target, null)
})

test('going back goes to what was heard, and then forward again plays the same track', () => {
  const random = seeded(11)
  let run: ShuffleRun = startRun(8, 2, random)
  const forward = stepForward(run, 2, 8, false, random)
  const second = forward.target as number
  const third = stepForward(forward.run, second, 8, false, random)
  const back = stepBack(third.run, third.target as number)
  assert.equal(back.target, second)
  const again = stepForward(back.run, second, 8, false, random)
  assert.equal(again.target, third.target)
  run = startRun(8, 2, random)
  assert.equal(stepBack(run, 2).target, null)
})

test('a track picked by hand does not come up again in the same pass', () => {
  const run = startRun(6, 0, seeded(5))
  const picked = run.upcoming[3]
  const next = jumpedTo(run, 0, picked)
  assert.ok(!next.upcoming.includes(picked))
  assert.equal(next.upcoming.length, run.upcoming.length - 1)
  assert.deepEqual(next.history, [0])
})

test('tracks put in after the current one play next, and the others keep their places', () => {
  const run: ShuffleRun = { upcoming: [4, 1, 3], history: [2, 0] }
  // two tracks were inserted at positions 2 and 3 (right after the current one at 1)
  const next = insertedAt(run, 2, 2)
  assert.deepEqual(next.upcoming, [2, 3, 6, 1, 5])
  assert.deepEqual(next.history, [4, 0])
})
