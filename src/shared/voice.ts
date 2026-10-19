/**
 * Voice commands, as the recognizer's text turned into something the player can do.
 *
 * The recognizer hears Russian and writes what it heard, whole utterance by utterance. A command is accepted in
 * two ways, so that talking near the microphone does not skip tracks:
 *  - after the wake word ("trashee"): the rest may carry a few more words ("траши, поставь на паузу");
 *  - on its own: the whole utterance has to be the command and nothing else ("дальше").
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

export type VoiceActionType = VoiceAction['type']

interface CommandSpec {
  type: VoiceActionType
  /** What the user can say; the first one is the one shown in the settings. */
  phrases: string[]
  /** What the settings say it does. */
  label: string
}

export const VOICE_COMMANDS: CommandSpec[] = [
  {
    type: 'next',
    phrases: [
      'дальше',
      'далее',
      'следующий',
      'следующая',
      'следующий трек',
      'следующая песня',
      'следующую',
      'следующую песню',
      'вперед',
      'пропусти',
      'пропустить'
    ],
    label: 'Следующий трек'
  },
  {
    type: 'previous',
    phrases: [
      'назад',
      'предыдущий',
      'предыдущая',
      'предыдущий трек',
      'предыдущая песня',
      'прошлый трек',
      'прошлая песня',
      'вернись'
    ],
    label: 'Предыдущий трек'
  },
  {
    type: 'pause',
    phrases: [
      'пауза',
      'паузу',
      'на паузу',
      'поставь на паузу',
      'стоп',
      'стой',
      'останови',
      'остановись',
      'хватит'
    ],
    label: 'Пауза'
  },
  {
    type: 'play',
    phrases: ['играй', 'играть', 'продолжай', 'продолжи', 'продолжить', 'включи', 'включи музыку'],
    label: 'Продолжить'
  },
  {
    type: 'restart',
    phrases: ['сначала', 'заново', 'повтори', 'с начала'],
    label: 'Сначала'
  },
  {
    type: 'louder',
    phrases: ['громче', 'погромче', 'сделай громче'],
    label: 'Громче'
  },
  {
    type: 'quieter',
    phrases: ['тише', 'потише', 'сделай тише'],
    label: 'Тише'
  },
  {
    type: 'like',
    phrases: ['лайк', 'лайкни', 'нравится', 'мне нравится', 'поставь лайк'],
    label: 'Нравится'
  },
  {
    type: 'unlike',
    phrases: ['убери лайк', 'убрать лайк', 'сними лайк'],
    label: 'Убрать лайк'
  },
  {
    type: 'dislike',
    phrases: ['дизлайк', 'не нравится', 'мне не нравится'],
    label: 'Не нравится'
  },
  {
    type: 'shuffle',
    phrases: ['перемешай', 'перемешать', 'вперемешку', 'перемешка'],
    label: 'Вперемешку'
  },
  {
    type: 'wave',
    phrases: [
      'моя волна',
      'мою волну',
      'включи мою волну',
      'включи волну',
      'вернись на волну',
      'вернись на мою волну',
      'волна',
      'волну'
    ],
    label: 'Моя волна'
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

const FILLERS = new Set(['пожалуйста', 'давай', 'ну', 'теперь', 'а', 'и', 'эй', 'слушай', 'ка'])
const MAX_WORDS_AFTER_WAKE = 5

/** Lowercase, ё as е, only letters and spaces. */
export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** Edit distance, for a wake word that came out slightly different. */
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
const WAKE_SHAPE = /^с?[тк]р[аэеёоуяы]{1,2}[шщжсз]{1,2}[иыеюяа]?$/

/** Only the consonants, the hissing ones counted as one and doubled ones as one: "трассы", "траши" and "та же" all come out close to "трс". */
function skeleton(word: string): string {
  return word
    .replace(/[^бвгджзйклмнпрстфхцчшщ]/g, '')
    .replace(/[сзшщжцч]/g, 'с')
    .replace(/(.)\1+/g, '$1')
}

const COMMAND_WORDS = new Set(
  VOICE_COMMANDS.flatMap((command) => command.phrases.flatMap((phrase) => normalize(phrase)))
)

export function isWakeWord(word: string): boolean {
  if (WAKE_WORDS.has(word) || word === 'trashee' || word === 'trashi') return true
  // A word of a command is never taken for the wake word: "тише" sounds a little like it.
  if (COMMAND_WORDS.has(word)) return false
  if (WAKE_SHAPE.test(word)) return true
  // What it sounds like, when it was written some other way: "та же", "трэжи".
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

const PHRASES: { words: string[]; type: VoiceActionType }[] = VOICE_COMMANDS.flatMap((command) =>
  command.phrases.map((phrase) => ({ words: normalize(phrase), type: command.type }))
).sort((a, b) => b.words.length - a.words.length)

const sameWords = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((word, i) => word === b[i])

/** The first place where [phrase] sits inside [words] as a run of whole words, or -1. */
function find(words: string[], phrase: string[]): number {
  for (let at = 0; at + phrase.length <= words.length; at++) {
    if (phrase.every((word, i) => words[at + i] === word)) return at
  }
  return -1
}

/** What a heard utterance asks the player to do, or null when it is just talk. */
export function parseVoice(text: string): VoiceAction | null {
  let words = normalize(text)
  if (words.length === 0) return null

  // "траши" alone, or twice in a row, is the wake word without a command.
  let woken = false
  for (;;) {
    if (words.length > 0 && isWakeWord(words[0])) words = words.slice(1)
    // The recognizer sometimes splits it in two: "тра ши".
    else if (words.length > 1 && words[0].length <= 3 && isWakeWord(words[0] + words[1]))
      words = words.slice(2)
    else break
    woken = true
  }
  words = words.filter((word) => !FILLERS.has(word))
  if (words.length === 0) return null

  if (woken) {
    if (words.length > MAX_WORDS_AFTER_WAKE) return null
    // The longest phrase first, so "не нравится" is not read as "нравится".
    const hit = PHRASES.find((phrase) => find(words, phrase.words) >= 0)
    return hit ? { type: hit.type } : null
  }
  const hit = PHRASES.find((phrase) => sameWords(words, phrase.words))
  return hit ? { type: hit.type } : null
}

/** The model the commands are recognized with: Vosk's small Russian one, packed as the browser build wants it. */
export const VOICE_MODEL = {
  file: 'vosk-model-small-ru-0.22.tar.gz',
  url: 'https://github.com/onemorefix1337/trashee/releases/download/model-vosk-ru-1/vosk-model-small-ru-0.22.tar.gz',
  /** Hex SHA-256 of the file; a download that does not match is thrown away. */
  sha256: 'a3f6acdba1d36cdf492c382a34a8b8adddcb61b9da3409e1e60c67fbb901c049',
  size: 46_224_314
}

/** What the page that listens tells the app. */
export type VoiceEvent =
  { kind: 'listening' } | { kind: 'text'; text: string } | { kind: 'error'; message: string }

export type VoiceModelStatus = 'missing' | 'downloading' | 'ready' | 'error'

export interface VoiceModelState {
  status: VoiceModelStatus
  received: number
  total: number
  error: string | null
}

export const INITIAL_VOICE_MODEL: VoiceModelState = {
  status: 'missing',
  received: 0,
  total: VOICE_MODEL.size,
  error: null
}
