import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  VOICE_COMMANDS,
  interpret,
  isWakeWord,
  makeProfile,
  minConfidenceFor,
  normalize,
  parseVoice,
  sanitizeProfile,
  type HeardWord
} from './voice.ts'

const type = (text: string): string | null => parseVoice(text)?.type ?? null
const reason = (
  text: string,
  words: HeardWord[] | null = null,
  requireWake = false
): string | null => {
  const verdict = interpret(text, words, { requireWake, minConfidence: 0.7 })
  return verdict.action ? null : verdict.reason
}
const heard = (...pairs: [string, number][]): HeardWord[] =>
  pairs.map(([word, conf]) => ({ word, conf }))

test('words are lowercased, ё becomes е and punctuation goes', () => {
  assert.deepEqual(normalize('Траши, ВКЛЮЧИ мою волну!'), ['траши', 'включи', 'мою', 'волну'])
  assert.deepEqual(normalize('Всё  хорошо - чуть-чуть'), ['все', 'хорошо', 'чуть-чуть'])
})

test('a command on its own is a command, softened or not', () => {
  assert.equal(type('дальше'), 'next')
  assert.equal(type('давай дальше'), 'next')
  assert.equal(type('ну следующий трек пожалуйста'), 'next')
  assert.equal(type('скип'), 'next')
  assert.equal(type('пауза'), 'pause')
  assert.equal(type('сними с паузы'), 'play')
  assert.equal(type('прибавь громкость'), 'louder')
  assert.equal(type('что сейчас играет'), 'nowPlaying')
})

test('with the wake word the command can have a few more words around it', () => {
  assert.equal(type('траши дальше'), 'next')
  assert.equal(type('траши, поставь на паузу'), 'pause')
  assert.equal(type('трэши пожалуйста включи мою волну'), 'wave')
  assert.equal(type('краше включи следующий трек'), 'next')
  assert.equal(type('траши сделай чуть погромче'), 'louder')
})

test('without the wake word, talk that merely contains a command word is ignored', () => {
  assert.equal(reason('а что будет дальше в этом фильме'), 'talk')
  assert.equal(reason('стоп подожди я не договорил'), 'talk')
  assert.equal(reason('он сказал назад не возвращайся'), 'talk')
  assert.equal(reason('мне нравится эта песня очень'), 'extra-words')
  assert.equal(reason('ну давай играй уже'), 'extra-words')
})

test('a denied command is not a command, even after the wake word', () => {
  assert.equal(reason('траши не надо паузу'), 'negated')
  assert.equal(reason('траши не ставь на паузу'), 'negated')
  assert.equal(reason('не дальше'), 'negated')
  // "не нравится" is a command of its own.
  assert.equal(type('не нравится'), 'dislike')
  assert.equal(type('траши мне не нравится'), 'dislike')
})

test('questions and stories with a command in them are talk', () => {
  assert.equal(reason('траши а что дальше'), 'talk')
  assert.equal(reason('траши я поставил на паузу'), 'talk')
  assert.equal(reason('траши он включил следующий трек'), 'talk')
  assert.equal(reason('траши когда будет пауза'), 'talk')
})

test('with the wake word, a long sentence is still ignored', () => {
  assert.equal(reason('траши мы с друзьями вчера весь вечер слушали и потом дальше'), 'talk')
  assert.equal(reason('траши мы с друзьями вчера весь вечер дальше'), 'extra-words')
})

test('the wake word alone does nothing', () => {
  assert.equal(reason('траши'), 'empty')
  assert.equal(reason('траши траши'), 'empty')
  assert.equal(reason(''), 'empty')
})

test('words the recognizer is unsure of are not acted on', () => {
  assert.equal(reason('пауза', heard(['пауза', 0.5])), 'unsure')
  assert.equal(reason('пауза', heard(['пауза', 0.95])), null)
  // The wake word is always unsure (it is not in the dictionary), and that does not matter.
  assert.equal(reason('краше дальше', heard(['краше', 0.4], ['дальше', 1])), null)
})

test('an unsure first word before a clear command is taken for the wake word', () => {
  const words = heard(['прошу', 0.38], ['поставь', 1], ['на', 1], ['паузу', 1])
  assert.equal(interpret('прошу поставь на паузу', words).action?.type, 'pause')
  // But not when the recognizer was sure of it: then it is a sentence.
  const sure = heard(['вася', 1], ['поставь', 1], ['на', 1], ['паузу', 1])
  assert.equal(interpret('вася поставь на паузу', sure).action, null)
})

test('when the wake word is required, a bare command is not enough', () => {
  assert.equal(reason('дальше', null, true), 'no-wake')
  assert.equal(reason('траши дальше', null, true), null)
})

test('a long word with a letter off still counts', () => {
  assert.equal(type('следущий'), 'next')
  assert.equal(type('предыдуший трек'), 'previous')
  // Short words must be exact: "тиши" is not "тише".
  assert.equal(type('тиши'), null)
  // And a word of the vocabulary is never read as another: "включи" is not "выключи".
  assert.equal(type('включи музыку'), 'play')
  assert.equal(type('выключи музыку'), 'pause')
})

test('every phrase of every command works alone and after the wake word', () => {
  for (const command of VOICE_COMMANDS) {
    for (const phrase of command.phrases) {
      assert.equal(type(phrase), command.type, phrase)
      assert.equal(type(`траши ${phrase}`), command.type, `траши ${phrase}`)
      assert.equal(type(`трассы ${phrase}`), command.type, `трассы ${phrase}`)
    }
  }
})

test('what the recognizer writes for the wake word varies, and a few of them count', () => {
  for (const word of [
    'траши',
    'трэши',
    'краше',
    'стражи',
    'трэша',
    'траш',
    'трассы',
    'трасса',
    'страхи',
    'trashee'
  ])
    assert.equal(isWakeWord(word), true, word)
  for (const word of [
    'дальше',
    'наши',
    'трек',
    'три',
    'кошки',
    'следующий',
    'страшно',
    'трогать',
    'тише',
    'давай'
  ])
    assert.equal(isWakeWord(word), false, word)
})

test('a wake word split in two, or written as "та же", still wakes it', () => {
  assert.equal(type('тра ши дальше'), 'next')
  assert.equal(type('та же дальше'), 'next')
  assert.equal(type('трассы включи мою волну'), 'wave')
})

test('ordinary short talk does not wake it', () => {
  for (const talk of ['так дальше', 'там дальше', 'тут стоп', 'это назад', 'мы дальше'])
    assert.equal(type(talk), null, talk)
})

test('sensitivity sets how sure the recognizer must be', () => {
  assert.equal(minConfidenceFor(0), 0.9)
  assert.equal(minConfidenceFor(100), 0.5)
  assert.ok(Math.abs(minConfidenceFor(50) - 0.7) < 1e-9)
  assert.equal(minConfidenceFor(500), 0.5)
})

test('a voice profile is the average direction of the samples', () => {
  const profile = makeProfile([
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [2, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  ])
  assert.equal(profile.samples, 2)
  const norm = Math.hypot(...profile.embedding)
  assert.ok(Math.abs(norm - 1) < 1e-9)
  assert.ok(profile.consistency > 0.99)
  assert.throws(() => makeProfile([]))
})

test('a stored profile is checked before it is used', () => {
  assert.equal(sanitizeProfile(null), null)
  assert.equal(sanitizeProfile({ embedding: [1, 2] }), null)
  assert.equal(sanitizeProfile({ embedding: new Array(16).fill('x') }), null)
  const ok = sanitizeProfile({
    embedding: new Array(256).fill(0.1),
    consistency: 0.8,
    samples: 5,
    created: 'x'
  })
  assert.equal(ok?.samples, 5)
})

test('a real word heard for the wake word only counts before the command alone', () => {
  assert.equal(type('страшно сделай чуть погромче'), 'louder')
  assert.equal(type('страшно дальше'), 'next')
  assert.equal(type('страшно дальше смотреть'), null)
  assert.equal(type('страшно'), null)
})
