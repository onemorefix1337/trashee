import { createDecipheriv } from 'node:crypto'

/** AES-128-CTR with a zero nonce; seeks by advancing the counter, so Range requests keep working. */
export function decryptFrom(
  key: string,
  startOffset: number
): TransformStream<Uint8Array, Uint8Array> {
  const iv = Buffer.alloc(16)
  iv.writeBigUInt64BE(BigInt(Math.floor(startOffset / 16)), 8)
  const decipher = createDecipheriv('aes-128-ctr', Buffer.from(key, 'hex'), iv)
  const misalign = startOffset % 16
  if (misalign) decipher.update(Buffer.alloc(misalign))
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(decipher.update(chunk))
    }
  })
}
