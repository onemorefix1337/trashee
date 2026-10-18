import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  newPairingCode,
  pairProof,
  requestSignature,
  sameHex,
  sha256Hex,
  wrapToken
} from './crypto.ts'

// The same values are checked by the Android tests, so the two apps agree on every byte.
const TOKEN = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

test('pairing proof, token wrapping and request signatures match the reference values', () => {
  assert.equal(
    pairProof('123456', 'dev-1', 'abcd'),
    'f32c81eb1c663067d107da3ed95bf4b8545257582cdf8952e61a0fb418a5e47c'
  )
  assert.equal(
    wrapToken(TOKEN, '123456', 'abcd'),
    '0cfc14a4d0787f6b5772f134e5ad5d369cec131d6568b9802d8987fcb580da82'
  )
  assert.equal(
    requestSignature(TOKEN, 'POST', '/state', 1_700_000_000_000, 'n0nce', '{"a":1}'),
    '5c8d3f7b63e483266b8846d8b3ab90d0a5f9af60b22e76f69f834d573e563bb7'
  )
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})

test('wrapping a token twice gives the token back', () => {
  assert.equal(wrapToken(wrapToken(TOKEN, '654321', 'n'), '654321', 'n'), TOKEN)
  assert.notEqual(wrapToken(TOKEN, '654321', 'n'), wrapToken(TOKEN, '654322', 'n'))
})

test('a signature changes with anything it covers', () => {
  const sig = requestSignature(TOKEN, 'POST', '/state', 1000, 'a', 'body')
  assert.notEqual(sig, requestSignature(TOKEN, 'GET', '/state', 1000, 'a', 'body'))
  assert.notEqual(sig, requestSignature(TOKEN, 'POST', '/command', 1000, 'a', 'body'))
  assert.notEqual(sig, requestSignature(TOKEN, 'POST', '/state', 1001, 'a', 'body'))
  assert.notEqual(sig, requestSignature(TOKEN, 'POST', '/state', 1000, 'b', 'body'))
  assert.notEqual(sig, requestSignature(TOKEN, 'POST', '/state', 1000, 'a', 'other'))
  assert.notEqual(
    sig,
    requestSignature(TOKEN.replace('00', '01'), 'POST', '/state', 1000, 'a', 'body')
  )
})

test('hex strings are compared by value, and never equal when empty or malformed', () => {
  assert.equal(sameHex('abcd', 'abcd'), true)
  assert.equal(sameHex('abcd', 'abce'), false)
  assert.equal(sameHex('abcd', 'abcdef'), false)
  assert.equal(sameHex('', ''), false)
})

test('pairing codes are six digits and not all the same', () => {
  const codes = new Set(Array.from({ length: 50 }, newPairingCode))
  assert.ok(codes.size > 40)
  for (const code of codes) assert.match(code, /^\d{6}$/)
})
