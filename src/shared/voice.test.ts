import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VOICE_COMMANDS, isWakeWord, normalize, parseVoice } from './voice.ts'

const type = (text: string): string | null => parseVoice(text)?.type ?? null

test('words are lowercased, ё becomes е and punctuation goes', () => {
  assert.deepEqual(normalize('Траши, ВКЛЮЧИ мою волну!'), ['траши', 'включи', 'мою', 'волну'])
  assert.deepEqual(normalize('Всё  хорошо'), ['все', 'хорошо'])
})

test('a command on its own is a command', () => {
  assert.equal(type('дальше'), 'next')
  assert.equal(type('Следующий трек'), 'next')
  assert.equal(type('пауза'), 'pause')
  assert.equal(type('стоп'), 'pause')
  assert.equal(type('назад'), 'previous')
  assert.equal(type('громче'), 'louder')
  assert.equal(type('моя волна'), 'wave')
})

test('with the wake word the command can have a few more words around it', () => {
  assert.equal(type('траши дальше'), 'next')
  assert.equal(type('траши, поставь на паузу'), 'pause')
  assert.equal(type('трэши пожалуйста включи мою волну'), 'wave')
  assert.equal(type('краше следующий'), 'next')
  assert.equal(type('стражи пауза'), 'pause')
})

test('without the wake word, talk that merely contains a command word is ignored', () => {
  assert.equal(type('а что будет дальше в этом фильме'), null)
  assert.equal(type('стоп подожди я не договорил'), null)
  assert.equal(type('он сказал назад не возвращайся'), null)
  assert.equal(type('мне нравится эта песня очень'), null)
  assert.equal(type('ну давай играй уже'), null)
})

test('with the wake word, a long sentence is still ignored', () => {
  assert.equal(type('траши я вчера смотрел фильм и там все время говорили дальше'), null)
})

test('the wake word alone does nothing', () => {
  assert.equal(type('траши'), null)
  assert.equal(type('траши траши'), null)
  assert.equal(type(''), null)
  assert.equal(type('   '), null)
})

test('"не нравится" is a dislike, not a like', () => {
  assert.equal(type('не нравится'), 'dislike')
  assert.equal(type('траши не нравится'), 'dislike')
  assert.equal(type('нравится'), 'like')
  assert.equal(type('убери лайк'), 'unlike')
  assert.equal(type('траши, лайк'), 'like')
})

test('what the recognizer writes for the wake word varies, and a few of them count', () => {
  for (const heard of [
    'траши',
    'трэши',
    'краше',
    'стражи',
    'трэша',
    'траш',
    'трассы',
    'трасса',
    'trashee'
  ])
    assert.equal(isWakeWord(heard), true, heard)
  for (const other of ['дальше', 'наши', 'трек', 'три', 'кошки', 'следующий', 'страшно', 'трогать'])
    assert.equal(isWakeWord(other), false, other)
})

test('a wake word the recognizer split in two is still the wake word', () => {
  assert.equal(type('тра ши дальше'), 'next')
  assert.equal(type('трассы включи мою волну'), 'wave')
  assert.equal(type('трассы дальше'), 'next')
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

test('a wake word that came out as "та же" still wakes it', () => {
  assert.equal(type('та же дальше'), 'next')
  assert.equal(type('тажи пауза'), 'pause')
})

test('ordinary talk does not wake it', () => {
  for (const talk of ['так дальше', 'там дальше', 'тут стоп', 'это назад', 'мы дальше'])
    assert.equal(type(talk), null, talk)
})
