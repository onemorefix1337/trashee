import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeTitle, pickBest, type LyricsCandidate } from './lyrics-match.ts'

test('titles are compared without versions, features and punctuation', () => {
  assert.equal(normalizeTitle('Грима (Remastered 2011)'), 'грима')
  assert.equal(normalizeTitle('Ёлка - 2020 Remaster'), 'елка')
  assert.equal(normalizeTitle('Song Name feat. Someone'), 'song name')
  assert.equal(normalizeTitle("Don't Stop Me Now!"), 'don t stop me now')
  assert.equal(normalizeTitle('Intro - Live'), 'intro')
})

const wanted = { title: 'Грима', artists: ['evacry'], durationSec: 180 }
const candidate = (extra: Partial<LyricsCandidate>): LyricsCandidate => ({
  trackName: 'Грима',
  artistName: 'Evacry',
  duration: 180,
  plainLyrics: 'text',
  ...extra
})

test('the same track by the same artist is accepted', () => {
  assert.ok(pickBest([candidate({})], wanted))
})

test('another title, artist, or a recording of a different length is rejected', () => {
  assert.equal(pickBest([candidate({ trackName: 'Другая' })], wanted), null)
  assert.equal(pickBest([candidate({ artistName: 'Someone Else' })], wanted), null)
  assert.equal(pickBest([candidate({ duration: 260 })], wanted), null)
})

test('a candidate without a duration is judged by name alone', () => {
  assert.ok(pickBest([candidate({ duration: undefined })], wanted))
})

test('synced text wins, then the closer length', () => {
  const plain = candidate({ plainLyrics: 'plain', duration: 180 })
  const synced = candidate({ syncedLyrics: '[00:01.00] x', duration: 183 })
  const closer = candidate({ syncedLyrics: '[00:01.00] y', duration: 181 })
  assert.equal(pickBest([plain, synced], wanted), synced)
  assert.equal(pickBest([synced, closer, plain], wanted), closer)
})

test('an artist among several, or joined in one string, still matches', () => {
  assert.ok(pickBest([candidate({ artistName: 'Evacry & Friend' })], wanted))
  assert.ok(pickBest([candidate({})], { ...wanted, artists: ['Friend', 'evacry'] }))
})
