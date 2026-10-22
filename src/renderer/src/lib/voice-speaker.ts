import * as ort from 'onnxruntime-web/wasm'
import { FBANK_BINS, fbank } from '../../../shared/fbank'

/** Shorter than this (0.3 s), a voice says too little about who it is. */
const MIN_FRAMES = 30

export interface SpeakerEngine {
  /** A fingerprint of the voice in [audio] (16 kHz), or null when the sound is too short to tell. */
  embed: (audio: Float32Array) => Promise<Float32Array | null>
}

/**
 * Runs the voice model: it turns a stretch of speech into a vector, and vectors of the same person point the
 * same way. The runtime is given as bytes (downloaded with the model), so nothing is fetched from files.
 */
export async function loadSpeakerEngine(pack: {
  model: Uint8Array
  runtime: Uint8Array
}): Promise<SpeakerEngine> {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmBinary = pack.runtime
  const session = await ort.InferenceSession.create(pack.model, { executionProviders: ['wasm'] })
  const input = session.inputNames[0]
  const output = session.outputNames[0]
  return {
    embed: async (audio) => {
      const frames = fbank(audio)
      if (frames.length < MIN_FRAMES) return null
      const data = new Float32Array(frames.length * FBANK_BINS)
      frames.forEach((frame, i) => data.set(frame, i * FBANK_BINS))
      const result = await session.run({
        [input]: new ort.Tensor('float32', data, [1, frames.length, FBANK_BINS])
      })
      return result[output].data as Float32Array
    }
  }
}
