/* global AudioWorkletProcessor, registerProcessor */

// Hands the microphone's sound over in blocks of 50 ms (800 samples at 16 kHz); the page decides what to do with them.
const BLOCK = 800

class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.block = new Float32Array(BLOCK)
    this.filled = 0
  }

  // This file is plain JavaScript on purpose: the browser loads it as it is, without a build step.
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    let offset = 0
    while (offset < channel.length) {
      const take = Math.min(channel.length - offset, BLOCK - this.filled)
      this.block.set(channel.subarray(offset, offset + take), this.filled)
      this.filled += take
      offset += take
      if (this.filled === BLOCK) {
        const copy = this.block.slice(0)
        this.port.postMessage(copy, [copy.buffer])
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('trashee-voice-capture', VoiceCapture)
