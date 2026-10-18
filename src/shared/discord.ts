/** What Discord is told about the music: a title, an artist and where in the track we are. */
export interface PresenceInfo {
  title: string
  artist: string
  /** A public https link to the cover; Discord fetches it itself. */
  coverUrl?: string
  durationSec: number
  positionSec: number
}

export const OP_HANDSHAKE = 0
export const OP_FRAME = 1
export const OP_CLOSE = 2
export const OP_PING = 3
export const OP_PONG = 4

const HEADER_BYTES = 8
const TEXT_LIMIT = 128

/** One message of the Discord IPC: a 4-byte opcode, a 4-byte length, then JSON. */
export function encodePacket(op: number, payload: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(payload))
  const packet = new Uint8Array(HEADER_BYTES + body.length)
  const view = new DataView(packet.buffer)
  view.setInt32(0, op, true)
  view.setInt32(4, body.length, true)
  packet.set(body, HEADER_BYTES)
  return packet
}

export interface Packet {
  op: number
  payload: unknown
}

/** Cuts whole packets off the front of what has arrived so far; the rest waits for more data. */
export function decodePackets(data: Uint8Array): { packets: Packet[]; rest: Uint8Array } {
  const packets: Packet[] = []
  let offset = 0
  while (data.length - offset >= HEADER_BYTES) {
    const view = new DataView(data.buffer, data.byteOffset + offset, HEADER_BYTES)
    const op = view.getInt32(0, true)
    const length = view.getInt32(4, true)
    if (length < 0 || length > 1 << 20) throw new Error('Некорректный пакет Discord')
    if (data.length - offset - HEADER_BYTES < length) break
    const body = data.subarray(offset + HEADER_BYTES, offset + HEADER_BYTES + length)
    let payload: unknown = null
    try {
      payload = JSON.parse(new TextDecoder().decode(body))
    } catch {
      /* a packet with a body that is not JSON is skipped */
    }
    packets.push({ op, payload })
    offset += HEADER_BYTES + length
  }
  return { packets, rest: data.subarray(offset) }
}

/** Discord wants 2 to 128 characters in each text line. */
function line(text: string): string {
  const trimmed = text.trim().slice(0, TEXT_LIMIT)
  return trimmed.padEnd(2, '\u200b')
}

/** The "Listening to" activity for a track that is playing now, with a bar that runs to the end of the track. */
export function buildActivity(info: PresenceInfo, nowMs: number): Record<string, unknown> {
  const now = Math.floor(nowMs / 1000)
  const position = Math.max(0, Math.min(info.positionSec, info.durationSec))
  const activity: Record<string, unknown> = {
    type: 2,
    details: line(info.title),
    state: line(info.artist || 'Неизвестный исполнитель'),
    instance: false
  }
  if (info.durationSec > 0) {
    activity.timestamps = {
      start: Math.round(now - position),
      end: Math.round(now + info.durationSec - position)
    }
  }
  if (info.coverUrl) activity.assets = { large_image: info.coverUrl, large_text: 'trashee' }
  return activity
}
