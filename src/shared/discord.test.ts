import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OP_FRAME, OP_HANDSHAKE, buildActivity, decodePackets, encodePacket } from './discord.ts'

test('a packet is written as opcode, length and JSON', () => {
  const packet = encodePacket(OP_HANDSHAKE, { v: 1, client_id: '42' })
  const view = new DataView(packet.buffer)
  assert.equal(view.getInt32(0, true), 0)
  const body = '{"v":1,"client_id":"42"}'
  assert.equal(view.getInt32(4, true), body.length)
  assert.equal(new TextDecoder().decode(packet.subarray(8)), body)
})

test('packets that arrive in pieces are put back together', () => {
  const first = encodePacket(OP_FRAME, { evt: 'READY' })
  const second = encodePacket(OP_FRAME, { cmd: 'SET_ACTIVITY' })
  const all = new Uint8Array([...first, ...second])

  const cut = decodePackets(all.subarray(0, first.length + 5))
  assert.equal(cut.packets.length, 1)
  assert.deepEqual(cut.packets[0].payload, { evt: 'READY' })
  assert.equal(cut.rest.length, 5)

  const rest = decodePackets(new Uint8Array([...cut.rest, ...all.subarray(first.length + 5)]))
  assert.equal(rest.packets.length, 1)
  assert.deepEqual(rest.packets[0].payload, { cmd: 'SET_ACTIVITY' })
  assert.equal(rest.rest.length, 0)
})

test('a header that promises an absurd length is refused', () => {
  const bad = new Uint8Array(8)
  new DataView(bad.buffer).setInt32(4, 1 << 30, true)
  assert.throws(() => decodePackets(bad))
})

test('the activity says "listening" and runs the bar to the end of the track', () => {
  const activity = buildActivity(
    {
      title: 'Стеклянный город',
      artist: 'Аврора Блу',
      durationSec: 200,
      positionSec: 50,
      coverUrl: 'https://x/y.jpg'
    },
    1_000_000_000_000
  )
  assert.equal(activity.type, 2)
  assert.equal(activity.details, 'Стеклянный город')
  assert.equal(activity.state, 'Аврора Блу')
  assert.deepEqual(activity.timestamps, { start: 1_000_000_000 - 50, end: 1_000_000_000 + 150 })
  assert.deepEqual(activity.assets, { large_image: 'https://x/y.jpg', large_text: 'trashee' })
})

test('lines Discord would refuse are fixed: too short, too long, empty', () => {
  const info = { title: 'a', artist: '', durationSec: 0, positionSec: 0 }
  const activity = buildActivity(info, 0)
  assert.ok(String(activity.details).length >= 2)
  assert.ok(String(activity.state).length >= 2)
  assert.equal(activity.timestamps, undefined)
  assert.equal(activity.assets, undefined)
  const long = buildActivity({ ...info, title: 'x'.repeat(500) }, 0)
  assert.equal(String(long.details).length, 128)
})

test('a position outside the track is kept inside it', () => {
  const activity = buildActivity(
    { title: 'ab', artist: 'cd', durationSec: 100, positionSec: 400 },
    0
  )
  assert.deepEqual(activity.timestamps, { start: -100, end: 0 })
})
