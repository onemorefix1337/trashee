/**
 * Log mel filterbank features computed the way Kaldi does by default (25 ms frames every 10 ms, a Povey window,
 * pre-emphasis, 80 mel bins from 20 Hz), which is what speaker-embedding models trained with Kaldi tools expect.
 * Samples are 16 kHz, -1..1; they are scaled to the 16-bit range first, as Kaldi reads them.
 */

export const FBANK_SAMPLE_RATE = 16000
const FRAME = 400
const SHIFT = 160
const FFT = 512
export const FBANK_BINS = 80
const LOW_HZ = 20
const PREEMPHASIS = 0.97
const EPSILON = 1.1920929e-7

const mel = (hz: number): number => 1127 * Math.log(1 + hz / 700)

const window = Float32Array.from({ length: FRAME }, (_, i) =>
  Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)), 0.85)
)

/** For each mel bin: the first FFT bin it covers and the weights from there. */
const banks: { start: number; weights: Float32Array }[] = (() => {
  const low = mel(LOW_HZ)
  const high = mel(FBANK_SAMPLE_RATE / 2)
  const delta = (high - low) / (FBANK_BINS + 1)
  const binWidth = FBANK_SAMPLE_RATE / FFT
  const result: { start: number; weights: Float32Array }[] = []
  for (let b = 0; b < FBANK_BINS; b++) {
    const left = low + b * delta
    const center = left + delta
    const right = center + delta
    let start = -1
    const weights: number[] = []
    for (let i = 0; i < FFT / 2; i++) {
      const m = mel(binWidth * i)
      if (m > left && m < right) {
        if (start < 0) start = i
        weights.push(m <= center ? (m - left) / (center - left) : (right - m) / (right - center))
      }
    }
    result.push({ start: Math.max(0, start), weights: Float32Array.from(weights) })
  }
  return result
})()

const cosTable = Float32Array.from({ length: FFT / 2 }, (_, i) =>
  Math.cos((-2 * Math.PI * i) / FFT)
)
const sinTable = Float32Array.from({ length: FFT / 2 }, (_, i) =>
  Math.sin((-2 * Math.PI * i) / FFT)
)

/** In-place radix-2 FFT of a real frame held in re (im starts at zero). */
function fft(re: Float32Array, im: Float32Array): void {
  for (let i = 1, j = 0; i < FFT; i++) {
    let bit = FFT >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let size = 2; size <= FFT; size <<= 1) {
    const half = size >> 1
    const step = FFT / size
    for (let start = 0; start < FFT; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cosTable[k * step]
        const wi = sinTable[k * step]
        const a = start + k
        const b = a + half
        const xr = re[b] * wr - im[b] * wi
        const xi = re[b] * wi + im[b] * wr
        re[b] = re[a] - xr
        im[b] = im[a] - xi
        re[a] += xr
        im[a] += xi
      }
    }
  }
}

/** Frames × 80 log energies, with the mean of each bin over the utterance taken away (what the models were trained on). */
export function fbank(samples: Float32Array): Float32Array[] {
  const count = samples.length < FRAME ? 0 : 1 + Math.floor((samples.length - FRAME) / SHIFT)
  const frames: Float32Array[] = []
  const re = new Float32Array(FFT)
  const im = new Float32Array(FFT)
  for (let f = 0; f < count; f++) {
    const offset = f * SHIFT
    let mean = 0
    for (let i = 0; i < FRAME; i++) mean += samples[offset + i] * 32768
    mean /= FRAME
    re.fill(0)
    im.fill(0)
    for (let i = 0; i < FRAME; i++) re[i] = samples[offset + i] * 32768 - mean
    for (let i = FRAME - 1; i > 0; i--) re[i] -= PREEMPHASIS * re[i - 1]
    re[0] -= PREEMPHASIS * re[0]
    for (let i = 0; i < FRAME; i++) re[i] *= window[i]
    fft(re, im)
    const frame = new Float32Array(FBANK_BINS)
    for (let b = 0; b < FBANK_BINS; b++) {
      const { start, weights } = banks[b]
      let energy = 0
      for (let k = 0; k < weights.length; k++) {
        const i = start + k
        energy += weights[k] * (re[i] * re[i] + im[i] * im[i])
      }
      frame[b] = Math.log(Math.max(energy, EPSILON))
    }
    frames.push(frame)
  }
  if (frames.length > 0) {
    const means = new Float32Array(FBANK_BINS)
    for (const frame of frames) for (let b = 0; b < FBANK_BINS; b++) means[b] += frame[b]
    for (let b = 0; b < FBANK_BINS; b++) means[b] /= frames.length
    for (const frame of frames) for (let b = 0; b < FBANK_BINS; b++) frame[b] -= means[b]
  }
  return frames
}

/** Cosine similarity of two embeddings: 1 the same direction, 0 unrelated. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}
