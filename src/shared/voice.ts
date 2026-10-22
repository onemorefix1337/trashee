/**
 * Voice commands, as the recognizer's text turned into something the player can do.
 *
 * The recognizer hears Russian and writes what it heard, whole utterance by utterance, with how sure it is of every
 * word. A command is accepted in two ways, so that talking near the microphone does not skip tracks:
 *  - after the wake word ("trashee"): the rest may carry a few more words ("траши, поставь на паузу");
 *  - on its own: the utterance has to be the command and nothing else ("дальше", "давай дальше").
 * On top of that, a command that sits in a sentence like talk does is left alone: denied ("не ставь на паузу"),
 * asked about ("что дальше"), told about ("он сказал назад", "я поставил на паузу").
 */

export type VoiceAction =
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'pause' }
  | { type: 'play' }
  | { type: 'restart' }
  | { type: 'louder' }
  | { type: 'quieter' }
  | { type: 'like' }
  | { type: 'unlike' }
  | { type: 'dislike' }
  | { type: 'shuffle' }
  | { type: 'wave' }
  | { type: 'nowPlaying' }

export type VoiceActionType = VoiceAction['type']

interface CommandSpec {
  type: VoiceActionType
  /** What the user can say; the first ones are the ones shown in the settings. */
  phrases: string[]
  /** What the settings say it does. */
  label: string
}

export const VOICE_COMMANDS: CommandSpec[] = [
  {
    type: 'next',
    phrases: [
      'дальше',
      'следующий',
      'следующая',
      'некст',
      'далее',
      'следующий трек',
      'следующая песня',
      'следующую',
      'следующую песню',
      'следующий давай',
      'вперед',
      'пропусти',
      'пропускай',
      'пропустить',
      'скип',
      'скипни',
      'переключи',
      'переключай',
      'другую',
      'другую песню',
      'другой трек',
      'смени трек',
      'смени песню'
    ],
    label: 'Следующий трек'
  },
  {
    type: 'previous',
    phrases: [
      'назад',
      'предыдущий',
      'верни',
      'предыдущая',
      'предыдущий трек',
      'предыдущая песня',
      'предыдущую',
      'прошлый трек',
      'прошлую',
      'прошлую песню',
      'обратно',
      'вернись',
      'верни назад',
      'верни предыдущую',
      'верни прошлую'
    ],
    label: 'Предыдущий трек'
  },
  {
    type: 'pause',
    phrases: [
      'пауза',
      'стоп',
      'стой',
      'паузу',
      'на паузу',
      'поставь на паузу',
      'поставь паузу',
      'останови',
      'остановись',
      'останови музыку',
      'замри',
      'хватит',
      'выключи музыку',
      'тишина'
    ],
    label: 'Пауза'
  },
  {
    type: 'play',
    phrases: [
      'играй',
      'продолжай',
      'поехали',
      'играть',
      'продолжи',
      'продолжить',
      'плей',
      'включи',
      'включи музыку',
      'запусти',
      'запусти музыку',
      'сними с паузы',
      'сними паузу',
      'убери паузу',
      'давай музыку'
    ],
    label: 'Продолжить'
  },
  {
    type: 'restart',
    phrases: [
      'сначала',
      'заново',
      'с начала',
      'повтори',
      'еще раз',
      'с самого начала',
      'начни сначала'
    ],
    label: 'Сначала'
  },
  {
    type: 'louder',
    phrases: [
      'громче',
      'погромче',
      'прибавь',
      'сделай громче',
      'сделай погромче',
      'еще громче',
      'прибавь громкость',
      'прибавь звук',
      'добавь звук',
      'добавь громкость'
    ],
    label: 'Громче'
  },
  {
    type: 'quieter',
    phrases: [
      'тише',
      'потише',
      'убавь',
      'сделай тише',
      'сделай потише',
      'еще тише',
      'убавь громкость',
      'убавь звук'
    ],
    label: 'Тише'
  },
  {
    type: 'like',
    phrases: [
      'лайк',
      'нравится',
      'в любимые',
      'лайкни',
      'мне нравится',
      'поставь лайк',
      'в избранное',
      'добавь в любимые',
      'добавь в избранное',
      'сохрани'
    ],
    label: 'Нравится'
  },
  {
    type: 'unlike',
    phrases: ['убери лайк', 'убрать лайк', 'сними лайк', 'убери из любимых', 'убери из избранного'],
    label: 'Убрать лайк'
  },
  {
    type: 'dislike',
    phrases: ['не нравится', 'дизлайк', 'мне не нравится', 'убери этот трек'],
    label: 'Не нравится'
  },
  {
    type: 'shuffle',
    phrases: [
      'перемешай',
      'вперемешку',
      'рандом',
      'перемешать',
      'перемешка',
      'шафл',
      'случайный порядок',
      'в случайном порядке'
    ],
    label: 'Вперемешку'
  },
  {
    type: 'wave',
    phrases: [
      'моя волна',
      'включи волну',
      'вернись на волну',
      'мою волну',
      'включи мою волну',
      'вернись на мою волну',
      'волна',
      'волну',
      'радио',
      'включи радио'
    ],
    label: 'Моя волна'
  },
  {
    type: 'nowPlaying',
    phrases: [
      'что играет',
      'что за трек',
      'что сейчас играет',
      'что за песня',
      'что это за песня',
      'что это за трек',
      'какой трек',
      'какая песня',
      'кто поет'
    ],
    label: 'Что играет'
  }
]

/** The wake word is English, the recognizer is Russian: what it writes for "trashee" varies, so a few guesses count. */
const WAKE_WORDS = new Set([
  'траши',
  'трэши',
  'треши',
  'трейши',
  'трэйши',
  'траш',
  'трэш',
  'треш',
  'трэша',
  'траша',
  'краше',
  'стражи',
  'страши',
  'страшей'
])

/**
 * Real words the recognizer sometimes writes for "trashee" with full confidence ("страшно", "прошу"). Taken for the
 * wake word only when what follows is the command alone, so "страшно дальше смотреть" stays talk.
 */
const WEAK_WAKE_WORDS = new Set(['страшно', 'прошу', 'страхи', 'краш', 'крашу'])

/** Words that only soften a command: "ну давай дальше", "пожалуйста, пауза". Allowed with or without the wake word. */
const SOFTENERS = new Set([
  'пожалуйста',
  'давай',
  'ну',
  'а',
  'и',
  'вот',
  'эй',
  'ка',
  'плиз',
  'слушай',
  'короче',
  'теперь',
  'сейчас'
])
/** Words that fit a spoken command after the wake word, but would be talk without it. */
const HELPERS = new Set([
  'тогда',
  'хочу',
  'мне',
  'нам',
  'можешь',
  'можно',
  'сделай',
  'включи',
  'поставь',
  'еще',
  'быстро',
  'срочно',
  'немного',
  'чуть',
  'чуть-чуть',
  'трек',
  'песню',
  'музыку'
])
/** What makes a sentence a question or a story rather than an order. */
const TALK = new Set([
  'что',
  'как',
  'почему',
  'зачем',
  'когда',
  'где',
  'куда',
  'откуда',
  'какой',
  'какая',
  'какое',
  'какие',
  'чей',
  'ли',
  'разве',
  'неужели',
  'сказал',
  'сказала',
  'сказали',
  'говорит',
  'говорил',
  'говорила',
  'говорят',
  'написал',
  'написано',
  'слово',
  'называется',
  'фильм',
  'фильме',
  'видео',
  'игре',
  'если',
  'потому',
  'чтобы',
  'был',
  'была',
  'было',
  'будет',
  'думаю',
  'кажется'
])
const NEGATIONS = new Set(['не', 'нет', 'ненадо', 'никогда', 'нельзя', 'незачем'])
/** A verb in the past tense tells about something instead of asking for it: "я поставил на паузу". */
const PAST_TENSE = /^[а-я]{3,}(ил|ыл|ал|ял|ел|ул|ол)(а|и|о|ся|ась|ись)?$/

/** More words than this after the wake word, besides the command, and it is a sentence, not a command. */
const MAX_EXTRA_AFTER_WAKE = 2
/** The recognizer is never sure of words it does not know, like the wake word itself. */
const UNKNOWN_WORD_CONFIDENCE = 0.7
/** A short word the recognizer is this unsure of, next to a command, is most likely a noise it put into words. */
const NOISE_WORD_CONFIDENCE = 0.5

export interface HeardWord {
  word: string
  /** 0..1, how sure the recognizer is of the word. */
  conf: number
}

export interface InterpretOptions {
  /** Only "trashee, …" counts. */
  requireWake: boolean
  /** Command words the recognizer is less sure of than this are not acted on. */
  minConfidence: number
}

export type VoiceRejection =
  'empty' | 'no-wake' | 'not-command' | 'unsure' | 'negated' | 'talk' | 'extra-words'

export type Verdict =
  { action: VoiceAction; woken: boolean } | { action: null; reason: VoiceRejection }

/** What the settings show next to "Услышал", when nothing was done. */
export const REJECTION_TEXT: Record<VoiceRejection, string> = {
  empty: 'тишина',
  'no-wake': 'без слова «trashee»',
  'not-command': 'не команда',
  unsure: 'расслышал неуверенно',
  negated: 'команду отменили словом «не»',
  talk: 'похоже на разговор, а не на команду',
  'extra-words': 'слишком много слов вокруг команды'
}

export const DEFAULT_INTERPRET: InterpretOptions = { requireWake: false, minConfidence: 0.7 }

/** Lowercase, ё as е, only letters, hyphens inside words and spaces. */
export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я\s-]/g, ' ')
    .replace(/(^|\s)-+|-+(\s|$)/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Edit distance, for words that came out slightly different. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]
}

/**
 * The shape of everything the recognizer writes for "trashee": a hard "тр" or "кр" (with a stray "с" before it),
 * a vowel, a hissing sound, maybe an ending: траши, трэши, краше, стражи, трассы, трэш.
 */
const WAKE_SHAPE = /^с?[тк]р[аэеёоуяы]{1,2}[шщжсзх]{1,2}[иыеюяа]?$/

/** Only the consonants, the hissing ones counted as one and doubled ones as one: траши, трассы, та же come out close to "трс". */
function skeleton(word: string): string {
  return word
    .replace(/[^бвгджзйклмнпрстфхцчшщ]/g, '')
    .replace(/[сзшщжцчх]/g, 'с')
    .replace(/(.)\1+/g, '$1')
}

const PHRASES: { words: string[]; type: VoiceActionType }[] = VOICE_COMMANDS.flatMap((command) =>
  command.phrases.map((phrase) => ({ words: normalize(phrase), type: command.type }))
).sort((a, b) => b.words.length - a.words.length)

const COMMAND_WORDS = new Set(PHRASES.flatMap((phrase) => phrase.words))

export function isWakeWord(word: string): boolean {
  if (WAKE_WORDS.has(word) || word === 'trashee' || word === 'trashi') return true
  // A word of a command is never taken for the wake word: "тише" sounds a little like it.
  if (COMMAND_WORDS.has(word) || SOFTENERS.has(word) || HELPERS.has(word)) return false
  if (WAKE_SHAPE.test(word)) return true
  // What it sounds like, when it was written some other way: "та же", "страхи".
  if (word.length >= 4 && word.length <= 7 && /^[ткс]/.test(word)) {
    if (distance(skeleton(word), 'трс') <= 1) return true
  }
  // "траши" / "трэши" with one slip, but not any short word that happens to be close.
  return (
    word.length >= 5 &&
    word.startsWith('тр') &&
    Math.min(distance(word, 'траши'), distance(word, 'трэши')) <= 1
  )
}

/**
 * A long word with a letter off: "следущий" for "следующий". A word that is itself in the vocabulary is never
 * stretched to another one ("включи" is not "выключи").
 */
function nearWord(heard: string, expected: string): boolean {
  if (heard === expected) return true
  if (COMMAND_WORDS.has(heard)) return false
  if (expected.length >= 9) return distance(heard, expected) <= 2
  if (expected.length >= 6) return distance(heard, expected) <= 1
  return false
}

interface Hit {
  type: VoiceActionType
  at: number
  length: number
}

/** The longest command phrase found in [words], and where; exact words first, near ones only when none fits. */
function findCommand(words: string[]): Hit | null {
  for (const same of [(a: string, b: string) => a === b, nearWord]) {
    for (const phrase of PHRASES) {
      for (let at = 0; at + phrase.words.length <= words.length; at++) {
        if (phrase.words.every((word, i) => same(words[at + i], word))) {
          return { type: phrase.type, at, length: phrase.words.length }
        }
      }
    }
  }
  return null
}

/** Strips the wake word from the front, when it is there; split ones too ("тра ши"). */
function stripWake(
  words: string[],
  confs: number[]
): { words: string[]; confs: number[]; woken: boolean } {
  let woken = false
  for (;;) {
    if (words.length > 0 && isWakeWord(words[0])) {
      words = words.slice(1)
      confs = confs.slice(1)
    } else if (words.length > 1 && words[0].length <= 3 && isWakeWord(words[0] + words[1])) {
      words = words.slice(2)
      confs = confs.slice(2)
    } else break
    woken = true
  }
  return { words, confs, woken }
}

function judge(
  words: string[],
  confs: number[],
  woken: boolean,
  options: InterpretOptions,
  maxExtra = MAX_EXTRA_AFTER_WAKE
): Verdict {
  if (words.length === 0) return { action: null, reason: 'empty' }
  const hit = findCommand(words)
  if (!hit) return { action: null, reason: 'not-command' }

  const before = words.slice(0, hit.at)
  const outside = words
    .map((word, i) => ({
      word,
      conf: confs[i] ?? 1,
      inside: i >= hit.at && i < hit.at + hit.length
    }))
    .filter(({ inside }) => !inside)
  const extra = outside
    .filter(({ word, conf }) => !(word.length <= 3 && conf < NOISE_WORD_CONFIDENCE))
    .map(({ word }) => word)
    .filter((word) => !SOFTENERS.has(word))

  // A command that is denied: "не ставь на паузу", "не надо дальше". ("не нравится" is a command itself.)
  if (before.some((word) => NEGATIONS.has(word))) return { action: null, reason: 'negated' }
  if (extra.some((word) => TALK.has(word) || PAST_TENSE.test(word)))
    return { action: null, reason: 'talk' }

  if (woken) {
    const unrelated = extra.filter((word) => !HELPERS.has(word))
    if (unrelated.length > maxExtra) return { action: null, reason: 'extra-words' }
  } else if (extra.length > 0) {
    // Without the wake word, only the command itself (and "давай", "пожалуйста") may be said.
    return { action: null, reason: 'extra-words' }
  }

  const sure = confs.slice(hit.at, hit.at + hit.length)
  const confidence = sure.length > 0 ? sure.reduce((sum, conf) => sum + conf, 0) / sure.length : 1
  if (confidence < options.minConfidence) return { action: null, reason: 'unsure' }
  return { action: { type: hit.type } as VoiceAction, woken }
}

/**
 * Whether a heard utterance asks the player to do something, and why not when it does not. [words] are the
 * recognizer's own words with their confidence; without them every word counts as certain.
 */
export function interpret(
  text: string,
  words: HeardWord[] | null = null,
  options: InterpretOptions = DEFAULT_INTERPRET
): Verdict {
  const tokens = normalize(text)
  if (tokens.length === 0) return { action: null, reason: 'empty' }
  const aligned =
    words && words.length === tokens.length
      ? words.map((word) => Math.max(0, Math.min(1, word.conf)))
      : tokens.map(() => 1)

  const stripped = stripWake(tokens, aligned)
  let verdict = judge(stripped.words, stripped.confs, stripped.woken, options)

  // The wake word is not in the recognizer's dictionary, so it comes out as some other word: one it is unsure of,
  // or one of a few real words. Such a first word in front of the command alone is taken for it:
  // "прошу поставь на паузу", "страшно сделай погромче".
  if (
    !stripped.woken &&
    verdict.action === null &&
    tokens.length >= 2 &&
    (aligned[0] < UNKNOWN_WORD_CONFIDENCE || WEAK_WAKE_WORDS.has(tokens[0])) &&
    !COMMAND_WORDS.has(tokens[0]) &&
    !NEGATIONS.has(tokens[0]) &&
    !TALK.has(tokens[0])
  ) {
    const retry = judge(tokens.slice(1), aligned.slice(1), true, options, 0)
    if (retry.action) verdict = retry
  }

  if (verdict.action && options.requireWake && !verdict.woken)
    return { action: null, reason: 'no-wake' }
  return verdict
}

/** What a heard utterance asks the player to do, or null; with the default options. */
export function parseVoice(text: string): VoiceAction | null {
  return interpret(text).action
}

/** How sure the recognizer must be, for a sensitivity of 0 (strict) to 100 (catch everything). */
export function minConfidenceFor(sensitivity: number): number {
  return 0.75 - 0.4 * (Math.max(0, Math.min(100, sensitivity)) / 100)
}

/* ---------- models ---------- */

export type VoiceModelKind = 'speech' | 'speaker'

export interface VoiceModelSpec {
  file: string
  url: string
  /** Hex SHA-256 of the file; a download that does not match is thrown away. */
  sha256: string
  size: number
}

const RELEASES = 'https://github.com/onemorefix1337/trashee/releases/download'

/** What each part of voice control downloads, once, when it is first turned on. */
export const VOICE_MODELS: Record<VoiceModelKind, VoiceModelSpec[]> = {
  /** Recognizes the words: Vosk's small Russian model, packed as the browser build wants it. */
  speech: [
    {
      file: 'vosk-model-small-ru-0.22.tar.gz',
      url: `${RELEASES}/model-vosk-ru-1/vosk-model-small-ru-0.22.tar.gz`,
      sha256: 'a3f6acdba1d36cdf492c382a34a8b8adddcb61b9da3409e1e60c67fbb901c049',
      size: 46_224_314
    }
  ],
  /**
   * Tells voices apart: WeSpeaker's ResNet34 trained on VoxCeleb (as exported for ONNX by sherpa-onnx), and the
   * ONNX runtime that runs it. The runtime has to be the build of the onnxruntime-web version in package.json.
   */
  speaker: [
    {
      file: 'wespeaker_en_voxceleb_resnet34.onnx',
      url: `${RELEASES}/model-speaker-1/wespeaker_en_voxceleb_resnet34.onnx`,
      sha256: '5ef208a9da1453335308a6b6f4e6dfbd7e183a38b604de0a57664f45d257fe94',
      size: 26_534_365
    },
    {
      file: 'ort-wasm-simd-threaded-1.30.0.wasm',
      url: `${RELEASES}/model-speaker-1/ort-wasm-simd-threaded-1.30.0.wasm`,
      sha256: '3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2',
      size: 14_239_897
    }
  ]
}

export const modelSize = (kind: VoiceModelKind): number =>
  VOICE_MODELS[kind].reduce((sum, file) => sum + file.size, 0)

export type VoiceModelStatus = 'missing' | 'downloading' | 'ready' | 'error'

export interface VoiceModelState {
  status: VoiceModelStatus
  received: number
  total: number
  error: string | null
}

export type VoiceModels = Record<VoiceModelKind, VoiceModelState>

export const initialModelState = (kind: VoiceModelKind): VoiceModelState => ({
  status: 'missing',
  received: 0,
  total: modelSize(kind),
  error: null
})

/* ---------- the listening window ---------- */

/** What the listening window needs to know; it can change while it listens. */
export interface VoiceConfig {
  /** Listening for commands, or collecting samples of the user's voice. */
  mode: 'listen' | 'enroll'
  /** 0..100: how quiet a sound still counts as speech. */
  sensitivity: number
  noiseSuppression: boolean
  /** Take a fingerprint of the voice of every command, to compare it with the user's. */
  checkSpeaker: boolean
}

/** What the listening window tells the app. */
export type VoiceEvent =
  | { kind: 'listening' }
  | { kind: 'level'; level: number; threshold: number }
  | {
      kind: 'heard'
      text: string
      words: HeardWord[]
      /** The voice's fingerprint, when the check is on and the words were a command; null otherwise. */
      embedding: number[] | null
      seconds: number
    }
  | { kind: 'sample'; embedding: number[]; seconds: number }
  | { kind: 'error'; message: string }

/* ---------- the user's voice (beta) ---------- */

/**
 * Utterances recorded to learn the user's voice: short ones like real commands, and longer ones that say more
 * about the voice.
 */
export const ENROLL_PHRASES = [
  'Траши, дальше',
  'Поставь на паузу',
  'Сделай погромче',
  'Траши, включи мою волну',
  'Верни предыдущую песню, пожалуйста',
  'Мне нравится этот трек, добавь в любимые'
]

export type SpeakerStrictness = 'soft' | 'normal' | 'strict'

/** Strictness moves the user's own threshold up or down. */
export const STRICTNESS_OFFSET: Record<SpeakerStrictness, number> = {
  soft: -0.08,
  normal: 0,
  strict: 0.08
}

/** For a profile without its own threshold (one sample, or saved by an older version). */
const DEFAULT_THRESHOLD = 0.42
/** The user's threshold sits this far below how their own samples scored against each other. */
const CALIBRATION_MARGIN = 0.12
const LOWEST_THRESHOLD = 0.22
const HIGHEST_THRESHOLD = 0.5
/** A command shorter than this says less about the voice, and scores lower even for the user. */
const SHORT_SECONDS = 1
const SHORT_ALLOWANCE = 0.05
/** Commands recognized with a clear margin keep the profile up to date with the microphone and the room. */
const RECENT_KEPT = 6
const ADAPT_MARGIN = 0.12

export interface SpeakerProfile {
  /** The average direction of the samples. */
  embedding: number[]
  /** Each recorded sample, as a unit vector. */
  vectors: number[][]
  /** Commands that were clearly the user's, newest last: the voice as it sounds lately. */
  recent: number[][]
  /** How alike a command must be, before strictness: measured on the user's own samples. */
  threshold: number
  /** How alike the recorded samples were to their average, the lowest of them: a hint of how clean they were. */
  consistency: number
  samples: number
  created: string
}

function unit(vector: ArrayLike<number>): number[] {
  let norm = 0
  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i]
  norm = Math.sqrt(norm) || 1
  return Array.from(vector, (value) => value / norm)
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value))

/**
 * Learns a voice from its samples: their average, and a threshold of its own. Each sample is scored against the
 * average of the others; how the worst of them did is how the user's commands can be expected to do with this
 * voice and this microphone, and the threshold goes a margin below that.
 */
export function makeProfile(embeddings: ArrayLike<number>[], now = new Date()): SpeakerProfile {
  if (embeddings.length === 0) throw new Error('no samples')
  const vectors = embeddings.map(unit)
  const sum = new Array<number>(vectors[0].length).fill(0)
  for (const vector of vectors) vector.forEach((value, i) => (sum[i] += value))
  const embedding = unit(sum)
  const consistency = Math.min(...vectors.map((vector) => dot(vector, embedding)))
  const selfScores =
    vectors.length >= 3
      ? vectors.map((vector) => dot(vector, unit(sum.map((value, i) => value - vector[i]))))
      : []
  const threshold =
    selfScores.length > 0
      ? clamp(Math.min(...selfScores) - CALIBRATION_MARGIN, LOWEST_THRESHOLD, HIGHEST_THRESHOLD)
      : DEFAULT_THRESHOLD
  return {
    embedding,
    vectors,
    recent: [],
    threshold,
    consistency,
    samples: embeddings.length,
    created: now.toISOString()
  }
}

/** How alike a voice is to the user's: to their average, or to the two samples it is closest to, whichever is more. */
export function speakerScore(profile: SpeakerProfile, embedding: ArrayLike<number>): number {
  const voice = unit(embedding)
  const toAverage = dot(profile.embedding, voice)
  const closest = [...profile.vectors, ...profile.recent]
    .map((vector) => dot(vector, voice))
    .sort((a, b) => b - a)
  const toClosest = closest.length >= 2 ? (closest[0] + closest[1]) / 2 : (closest[0] ?? toAverage)
  return Math.max(toAverage, toClosest)
}

/** The score a command needs, for this user, this strictness and a command this long. */
export function speakerThreshold(
  profile: SpeakerProfile,
  strictness: SpeakerStrictness,
  seconds: number
): number {
  const allowance = seconds < SHORT_SECONDS ? SHORT_ALLOWANCE : 0
  return clamp(profile.threshold + STRICTNESS_OFFSET[strictness] - allowance, 0.15, 0.75)
}

/** A command that was clearly the user's is remembered; returns the updated profile, or null when it was not clear. */
export function adaptProfile(
  profile: SpeakerProfile,
  embedding: ArrayLike<number>,
  score: number
): SpeakerProfile | null {
  if (score < profile.threshold + ADAPT_MARGIN) return null
  return { ...profile, recent: [...profile.recent, unit(embedding)].slice(-RECENT_KEPT) }
}

const isVector = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((item) => typeof item === 'number' && Number.isFinite(item))

/** Takes what was stored and returns a profile, or null when it is not one. */
export function sanitizeProfile(raw: unknown): SpeakerProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const embedding = input.embedding
  if (
    !Array.isArray(embedding) ||
    embedding.length < 16 ||
    !isVector(embedding, embedding.length)
  ) {
    return null
  }
  const vectorsOf = (value: unknown): number[][] =>
    Array.isArray(value) ? value.filter((item) => isVector(item, embedding.length)) : []
  return {
    embedding,
    vectors: vectorsOf(input.vectors),
    recent: vectorsOf(input.recent).slice(-RECENT_KEPT),
    threshold:
      typeof input.threshold === 'number' && Number.isFinite(input.threshold)
        ? clamp(input.threshold, LOWEST_THRESHOLD, HIGHEST_THRESHOLD)
        : DEFAULT_THRESHOLD,
    consistency: typeof input.consistency === 'number' ? input.consistency : 0,
    samples: typeof input.samples === 'number' ? input.samples : 0,
    created: typeof input.created === 'string' ? input.created : ''
  }
}
