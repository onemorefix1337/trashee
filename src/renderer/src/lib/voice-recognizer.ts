import { createModel, type KaldiRecognizer, type Model } from 'vosk-browser'
import type { HeardWord } from '../../../shared/voice'
import { GATE_BLOCK, GATE_SAMPLE_RATE, VoiceGate, trimToSpeech } from '../../../shared/voice-gate'
// Not inlined as data: the page's security policy only runs scripts that come from the app's own files.
import workletUrl from './voice-capture.worklet.js?url&no-inline'

/** The meter is told this often: every second block, ten times a second. */
const LEVEL_EVERY_BLOCKS = 2

export interface Recognizer {
  stop: () => void
  setSensitivity: (sensitivity: number) => void
  /** Opens the microphone again with or without the system's noise suppression; the model stays loaded. */
  setNoiseSuppression: (on: boolean) => Promise<void>
}

export interface Utterance {
  text: string
  words: HeardWord[]
  /** The sound of the utterance, 16 kHz, as the recognizer got it. */
  audio: Float32Array
}

interface Options {
  /** The speech model, as downloaded. */
  model: Uint8Array
  sensitivity: number
  noiseSuppression: boolean
  /** What was heard, once a phrase is over. */
  onUtterance: (utterance: Utterance) => void
  /** How loud the microphone is, and how loud it has to be to count as speech. */
  onLevel: (level: number, threshold: number) => void
  /** The microphone went away or something else broke for good. */
  onFailure: (message: string) => void
}

function join(blocks: Float32Array[]): Float32Array {
  const audio = new Float32Array(blocks.reduce((sum, block) => sum + block.length, 0))
  let offset = 0
  for (const block of blocks) {
    audio.set(block, offset)
    offset += block.length
  }
  return audio
}

/**
 * Listens to the microphone and writes down what is said, a phrase at a time, without a network.
 * Only the sound of speech reaches the recognizer: the rest of the time it is idle.
 */
export async function startRecognizer(options: Options): Promise<Recognizer> {
  const url = URL.createObjectURL(
    new Blob([options.model as BlobPart], { type: 'application/gzip' })
  )
  let vosk: Model | null = null
  let recognizer: KaldiRecognizer | null = null
  let closeMicrophone: (() => void) | null = null
  let stopped = false
  let gateRef: VoiceGate | null = null

  // The sound of the phrase being said, and of phrases already over whose words have not come back yet.
  let collecting: Float32Array[] = []
  const finished: Float32Array[][] = []

  const stop = (): void => {
    stopped = true
    closeMicrophone?.()
    closeMicrophone = null
    recognizer?.remove()
    vosk?.terminate()
    URL.revokeObjectURL(url)
    recognizer = null
    vosk = null
  }

  try {
    vosk = await createModel(url)
    // The model is inside the recognizer now; the download is not needed any more.
    URL.revokeObjectURL(url)
    if (stopped) throw new Error('stopped')
    const live = new vosk.KaldiRecognizer(GATE_SAMPLE_RATE)
    recognizer = live
    live.setWords(true)
    live.on('result', (message) => {
      if (message.event !== 'result') return
      const blocks = finished.shift() ?? collecting.splice(0)
      const text = message.result.text.trim()
      if (!text) return
      const words = (message.result.result ?? []).map(({ word, conf }) => ({ word, conf }))
      // Half the level that opened the gate: the soft ends of words stay, the silence goes.
      const speech = trimToSpeech(blocks, (gateRef?.threshold ?? 0) / 2)
      options.onUtterance({ text, words, audio: join(speech) })
    })

    gateRef = new VoiceGate(
      {
        feed: (block) => {
          collecting.push(block)
          live.acceptWaveformFloat(block, GATE_SAMPLE_RATE)
        },
        end: () => {
          finished.push(collecting)
          collecting = []
          live.retrieveFinalResult()
        }
      },
      options.sensitivity
    )
    const gate = gateRef
    let blocksSeen = 0
    const give = (block: Float32Array): void => {
      if (stopped || block.length !== GATE_BLOCK) return
      gate.push(block)
      if (++blocksSeen % LEVEL_EVERY_BLOCKS === 0) options.onLevel(gate.lastLevel, gate.threshold)
    }

    const openMicrophone = async (noiseSuppression: boolean): Promise<() => void> => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression,
          autoGainControl: true,
          channelCount: 1
        }
      })
      // A context at the recognizer's own rate: the browser converts what the microphone gives.
      const context = new AudioContext({ sampleRate: GATE_SAMPLE_RATE })
      const close = (): void => {
        stream.getTracks().forEach((track) => track.stop())
        void context.close().catch(() => undefined)
      }
      try {
        const source = context.createMediaStreamSource(stream)
        await context.audioWorklet.addModule(workletUrl)
        const capture = new AudioWorkletNode(context, 'trashee-voice-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1
        })
        capture.port.onmessage = (event: MessageEvent<Float32Array>) => give(event.data)
        // Not heard, but some systems only run a node that leads to the speakers.
        const silent = context.createGain()
        silent.gain.value = 0
        source.connect(capture).connect(silent).connect(context.destination)
        stream.getAudioTracks()[0]?.addEventListener('ended', () => {
          if (stopped || closeMicrophone !== close) return
          stop()
          options.onFailure('Микрофон отключился')
        })
      } catch (error) {
        close()
        throw error
      }
      return close
    }

    closeMicrophone = await openMicrophone(options.noiseSuppression)
    if (stopped) closeMicrophone()

    return {
      stop,
      setSensitivity: (sensitivity) => gate.setSensitivity(sensitivity),
      setNoiseSuppression: async (on) => {
        if (stopped) return
        closeMicrophone?.()
        closeMicrophone = null
        gate.reset()
        collecting = []
        closeMicrophone = await openMicrophone(on)
      }
    }
  } catch (error) {
    stop()
    throw error
  }
}
