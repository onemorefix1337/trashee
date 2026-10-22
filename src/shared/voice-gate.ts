/**
 * Decides which parts of the microphone's sound are worth giving to the recognizer. Recognizing silence all day
 * costs a core of the processor; an utterance is only a second or two. Sound is cut into blocks of equal length;
 * when one is loud enough the gate opens (with the blocks just before it, so the start of the first word is not
 * lost), and it closes after a pause. Nothing is fed to the recognizer while it is closed.
 */

export const GATE_SAMPLE_RATE = 16000
/** 50 ms of sound. */
export const GATE_BLOCK = 800

/** Blocks kept from before the loud one: 300 ms. */
const PREROLL_BLOCKS = 6
/** A pause this long (500 ms) ends the utterance. */
const END_BLOCKS = 10
/** Even without a pause, an utterance is cut here (8 s): a command is never this long. */
const MAX_BLOCKS = 160
/** The first half second only listens to the room (it may be humming already), and opens nothing. */
const WARM_UP_BLOCKS = 10

export interface GateLevels {
  /** Never open on less than this, however quiet the room is. */
  minLevel: number
  /** How much louder than the room a block has to be. */
  louderThanRoom: number
}

/**
 * The gate's bar for a sensitivity of 0 (only a voice close to the microphone) to 100 (a whisper across the room).
 * 50 is about a normal voice at arm's length.
 */
export function gateLevels(sensitivity: number): GateLevels {
  const s = Math.max(0, Math.min(100, sensitivity)) / 100
  return { minLevel: 0.03 * Math.pow(0.004 / 0.03, s), louderThanRoom: 4 - 2 * s }
}

export interface GateEvents {
  /** A block that belongs to an utterance. */
  feed: (block: Float32Array) => void
  /** The utterance is over. */
  end: () => void
}

export function rms(block: Float32Array): number {
  let sum = 0
  for (let i = 0; i < block.length; i++) sum += block[i] * block[i]
  return Math.sqrt(sum / Math.max(1, block.length))
}

export class VoiceGate {
  private readonly events: GateEvents
  private readonly preroll: Float32Array[] = []
  private speaking = false
  private quietBlocks = 0
  private blocks = 0
  /** How loud the room is when nobody speaks. */
  private room = 0
  private seen = 0
  private levels: GateLevels
  /** The level of the last block, for a meter. */
  lastLevel = 0

  constructor(events: GateEvents, sensitivity = 50) {
    this.events = events
    this.levels = gateLevels(sensitivity)
  }

  get open(): boolean {
    return this.speaking
  }

  setSensitivity(sensitivity: number): void {
    this.levels = gateLevels(sensitivity)
  }

  /** How loud a block has to be to open the gate right now. */
  get threshold(): number {
    return Math.max(this.levels.minLevel, this.room * this.levels.louderThanRoom)
  }

  /** One block of GATE_BLOCK samples. */
  push(block: Float32Array): void {
    const loud = rms(block)
    this.lastLevel = loud
    const warm = this.seen >= WARM_UP_BLOCKS
    this.seen += 1
    const isLoud = warm && loud >= this.threshold

    if (!this.speaking) {
      if (!isLoud) {
        // The room's noise follows slowly, so a long hum raises the bar instead of opening the gate forever.
        this.room = this.room === 0 ? loud : this.room * 0.95 + loud * 0.05
        this.preroll.push(block)
        if (this.preroll.length > PREROLL_BLOCKS) this.preroll.shift()
        return
      }
      this.speaking = true
      this.quietBlocks = 0
      this.blocks = 0
      for (const earlier of this.preroll) this.events.feed(earlier)
      this.preroll.length = 0
    }

    this.events.feed(block)
    this.blocks += 1
    this.quietBlocks = isLoud ? 0 : this.quietBlocks + 1
    const tooLong = this.blocks >= MAX_BLOCKS
    if (this.quietBlocks >= END_BLOCKS || tooLong) {
      this.speaking = false
      this.quietBlocks = 0
      // No command lasts this long: it is a noise that does not stop, and it is the room from now on.
      if (tooLong) this.room = Math.max(this.room, loud)
      this.events.end()
    }
  }

  /** Forgets everything, as when listening is turned off in the middle of a word. */
  reset(): void {
    this.speaking = false
    this.quietBlocks = 0
    this.blocks = 0
    this.seen = 0
    this.room = 0
    this.preroll.length = 0
  }
}

/**
 * The blocks of an utterance without the quiet ones around it (the pause that ended it, the sound kept from before
 * it), with a little margin: comparing voices works on the voice, and silence only dilutes it.
 */
export function trimToSpeech(blocks: Float32Array[], level: number, margin = 2): Float32Array[] {
  let first = -1
  let last = -1
  blocks.forEach((block, i) => {
    if (rms(block) >= level) {
      if (first < 0) first = i
      last = i
    }
  })
  if (first < 0) return blocks
  return blocks.slice(Math.max(0, first - margin), Math.min(blocks.length, last + 1 + margin))
}
