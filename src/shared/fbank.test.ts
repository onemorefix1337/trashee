import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FBANK_BINS, cosine, fbank } from './fbank.ts'

const tone = (hz: number, seconds: number): Float32Array =>
  Float32Array.from(
    { length: Math.round(16000 * seconds) },
    (_, i) => 0.3 * Math.sin((2 * Math.PI * hz * i) / 16000)
  )

test('a second of sound is 98 frames of 80 bins, as Kaldi counts them', () => {
  const frames = fbank(tone(440, 1))
  assert.equal(frames.length, 98)
  assert.equal(frames[0].length, FBANK_BINS)
})

test('less than one frame of sound gives nothing', () => {
  assert.equal(fbank(new Float32Array(100)).length, 0)
})

test('each bin averages to zero over the utterance', () => {
  const frames = fbank(tone(1000, 0.5))
  for (let b = 0; b < FBANK_BINS; b++) {
    const mean = frames.reduce((sum, frame) => sum + frame[b], 0) / frames.length
    assert.ok(Math.abs(mean) < 1e-3)
  }
})

test('a low tone and a high tone light up different bins', () => {
  const peak = (hz: number): number => {
    // Without the mean taken away the loudest bin is where the tone is: compare against a silent half.
    const signal = new Float32Array(16000)
    signal.set(tone(hz, 0.5), 0)
    const frames = fbank(signal)
    const first = frames[5]
    return first.indexOf(Math.max(...first))
  }
  assert.ok(peak(300) < peak(3000))
})

test('cosine similarity is 1 for the same direction, 0 for perpendicular, and safe for zeros', () => {
  assert.equal(cosine([1, 2, 3], [2, 4, 6]), 1)
  assert.equal(cosine([1, 0], [0, 1]), 0)
  assert.equal(cosine([0, 0], [1, 1]), 0)
})
