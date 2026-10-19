import { createModel, type KaldiRecognizer, type Model } from 'vosk-browser'
import { GATE_BLOCK, GATE_SAMPLE_RATE, VoiceGate } from '../../../shared/voice-gate'
// Not inlined as data: the page's security policy only runs scripts that come from the app's own files.
import workletUrl from './voice-capture.worklet.js?url&no-inline'

export interface Recognizer {
  stop: () => void
}

interface Options {
  /** The speech model, as downloaded. */
  model: Uint8Array
  /** What was heard, once a phrase is over. */
  onText: (text: string) => void
  /** The microphone went away or something else broke for good. */
  onFailure: (message: string) => void
}

/**
 * Listens to the microphone and writes down what is said, a phrase at a time, without a network.
 * Only the sound of speech reaches the recognizer: the rest of the time it is idle.
 */
export async function startRecognizer({ model, onText, onFailure }: Options): Promise<Recognizer> {
  const url = URL.createObjectURL(new Blob([model as BlobPart], { type: 'application/gzip' }))
  let vosk: Model | null = null
  let recognizer: KaldiRecognizer | null = null
  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  let stopped = false

  const stop = (): void => {
    stopped = true
    stream?.getTracks().forEach((track) => track.stop())
    void context?.close().catch(() => undefined)
    recognizer?.remove()
    vosk?.terminate()
    URL.revokeObjectURL(url)
    stream = null
    context = null
    recognizer = null
    vosk = null
  }

  try {
    vosk = await createModel(url)
    // The model is inside the recognizer now; the download is not needed any more.
    URL.revokeObjectURL(url)
    if (stopped) throw new Error('stopped')
    recognizer = new vosk.KaldiRecognizer(GATE_SAMPLE_RATE)
    recognizer.on('result', (message) => {
      if (message.event !== 'result') return
      const text = message.result.text.trim()
      if (text) onText(text)
    })

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    })
    // A context at the recognizer's own rate: the browser converts what the microphone gives.
    context = new AudioContext({ sampleRate: GATE_SAMPLE_RATE })
    const source = context.createMediaStreamSource(stream)

    const live = recognizer
    const gate = new VoiceGate({
      feed: (block) => live.acceptWaveformFloat(block, GATE_SAMPLE_RATE),
      end: () => live.retrieveFinalResult()
    })
    const give = (block: Float32Array): void => {
      if (!stopped && block.length === GATE_BLOCK) gate.push(block)
    }

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
      if (stopped) return
      stop()
      onFailure('Микрофон отключился')
    })
  } catch (error) {
    stop()
    throw error
  }
  return { stop }
}
