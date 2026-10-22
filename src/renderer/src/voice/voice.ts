import { cosine } from '../../../shared/fbank'
import { interpret, type VoiceConfig } from '../../../shared/voice'
import { startRecognizer, type Recognizer, type Utterance } from '../lib/voice-recognizer'
import { loadSpeakerEngine, type SpeakerEngine } from '../lib/voice-speaker'

/** A sample of the user's voice for learning it has to be at least this long. */
const MIN_SAMPLE_SECONDS = 1

let config: VoiceConfig | null = null
let recognizer: Recognizer | null = null
let speaker: Promise<SpeakerEngine | null> | null = null

const friendly = (error: unknown): string => {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : ''
  return name === 'NotAllowedError' || name === 'NotFoundError' || name === 'NotReadableError'
    ? 'Микрофон недоступен. Проверь, что он подключён и разрешён для trashee.'
    : message || 'Не удалось включить микрофон'
}

/** The voice model is loaded the first time it is needed, and only once. */
function speakerEngine(): Promise<SpeakerEngine | null> {
  speaker ??= window.voice
    .speakerPack()
    .then((pack) => {
      // Not downloaded yet: ask again next time instead of remembering that there is none.
      if (!pack) speaker = null
      return pack ? loadSpeakerEngine(pack) : null
    })
    .catch((error: unknown) => {
      speaker = null
      window.voice.report({
        kind: 'error',
        message: `Модель голоса не загрузилась: ${friendly(error)}`
      })
      return null
    })
  return speaker
}

async function onUtterance({ text, words, audio }: Utterance): Promise<void> {
  const current = config
  if (!current) return
  const seconds = audio.length / 16000

  if (current.mode === 'enroll') {
    if (seconds < MIN_SAMPLE_SECONDS) return
    const embedding = await (await speakerEngine())?.embed(audio)
    if (embedding)
      window.voice.report({ kind: 'sample', embedding: Array.from(embedding), seconds })
    return
  }

  // The voice is only compared when it said a command: no work for ordinary talk.
  let score: number | null = null
  if (current.speaker && interpret(text, words, { requireWake: false, minConfidence: 0 }).action) {
    const embedding = await (await speakerEngine())?.embed(audio)
    score = embedding ? cosine(current.speaker, embedding) : null
  }
  window.voice.report({ kind: 'heard', text, words, speaker: score })
}

async function apply(next: VoiceConfig): Promise<void> {
  const before = config
  config = next
  if (!recognizer || !before) return
  if (before.sensitivity !== next.sensitivity) recognizer.setSensitivity(next.sensitivity)
  if (before.noiseSuppression !== next.noiseSuppression) {
    await recognizer.setNoiseSuppression(next.noiseSuppression).catch((error: unknown) => {
      window.voice.report({ kind: 'error', message: friendly(error) })
    })
  }
  if ((next.speaker || next.mode === 'enroll') && !speaker) void speakerEngine()
}

/** Starts listening as soon as the page loads, and tells the app how it went. */
async function listen(): Promise<void> {
  try {
    config = await window.voice.config()
    if (!config) throw new Error('Нет настроек')
    window.voice.onConfig((next) => void apply(next))
    const model = await window.voice.modelBytes()
    if (!model) throw new Error('Модель не найдена')
    if (config.speaker || config.mode === 'enroll') void speakerEngine()
    recognizer = await startRecognizer({
      model,
      sensitivity: config.sensitivity,
      noiseSuppression: config.noiseSuppression,
      onUtterance: (utterance) => void onUtterance(utterance),
      onLevel: (level, threshold) => window.voice.report({ kind: 'level', level, threshold }),
      onFailure: (message) => window.voice.report({ kind: 'error', message })
    })
    window.voice.report({ kind: 'listening' })
  } catch (error) {
    window.voice.report({ kind: 'error', message: friendly(error) })
  }
}

void listen()
