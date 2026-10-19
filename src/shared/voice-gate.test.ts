import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GATE_BLOCK, VoiceGate, rms } from './voice-gate.ts'

const silence = (level = 0.001): Float32Array => {
  const block = new Float32Array(GATE_BLOCK)
  for (let i = 0; i < block.length; i++) block[i] = i % 2 === 0 ? level : -level
  return block
}
const speech = (): Float32Array => {
  const block = new Float32Array(GATE_BLOCK)
  for (let i = 0; i < block.length; i++) block[i] = 0.2 * Math.sin(i / 7)
  return block
}

function run(blocks: Float32Array[]): { fed: number; ended: number } {
  let fed = 0
  let ended = 0
  const gate = new VoiceGate({ feed: () => (fed += 1), end: () => (ended += 1) })
  for (const block of blocks) gate.push(block)
  return { fed, ended }
}

test('the level of a block is its root mean square', () => {
  assert.equal(rms(new Float32Array(10)), 0)
  assert.ok(Math.abs(rms(silence(0.5)) - 0.5) < 1e-6)
})

test('silence is never fed to the recognizer', () => {
  const result = run(Array.from({ length: 200 }, () => silence()))
  assert.deepEqual(result, { fed: 0, ended: 0 })
})

test('an utterance is fed with the sound just before it, and ends after a pause', () => {
  const blocks = [
    ...Array.from({ length: 20 }, () => silence()),
    ...Array.from({ length: 10 }, () => speech()),
    ...Array.from({ length: 30 }, () => silence())
  ]
  const result = run(blocks)
  assert.equal(result.ended, 1)
  // 6 blocks before, 10 of speech, 10 of pause that ended it.
  assert.equal(result.fed, 6 + 10 + 10)
})

test('a short pause inside the words does not end them', () => {
  const blocks = [
    ...Array.from({ length: 12 }, () => silence()),
    ...Array.from({ length: 4 }, () => speech()),
    ...Array.from({ length: 4 }, () => silence()),
    ...Array.from({ length: 4 }, () => speech()),
    ...Array.from({ length: 20 }, () => silence())
  ]
  assert.equal(run(blocks).ended, 1)
})

test('two utterances are two ends', () => {
  const one = [
    ...Array.from({ length: 6 }, () => speech()),
    ...Array.from({ length: 15 }, () => silence())
  ]
  const warmUp = Array.from({ length: 12 }, () => silence())
  assert.equal(run([...warmUp, ...one, ...one]).ended, 2)
})

test('a long sound is cut after eight seconds', () => {
  const warmUp = Array.from({ length: 12 }, () => silence())
  const result = run([...warmUp, ...Array.from({ length: 400 }, () => speech())])
  assert.ok(result.ended >= 1)
})

test('a steady hum raises the bar instead of keeping the gate open', () => {
  const hum = (): Float32Array => silence(0.02)
  const blocks = [
    ...Array.from({ length: 200 }, () => hum()),
    ...Array.from({ length: 6 }, () => speech())
  ]
  assert.equal(run(Array.from({ length: 200 }, () => hum())).fed, 0)
  assert.ok(run(blocks).fed > 0)
})
