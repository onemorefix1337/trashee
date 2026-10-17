import type { LyricLine } from './types'

const TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
const OFFSET = /^\[offset:\s*([+-]?\d+)\s*\]/i

/**
 * Parses LRC: "[mm:ss.xx] line", several stamps per line for a repeated chorus, and the optional [offset:ms] tag.
 * Metadata tags ([ar:...], [ti:...]) and lines without a stamp are ignored. Lines come back sorted by time.
 */
export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = []
  let offsetMs = 0

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const offset = OFFSET.exec(line)
    if (offset) {
      offsetMs = Number(offset[1])
      continue
    }

    const stamps = [...line.matchAll(TIMESTAMP)]
    if (stamps.length === 0) continue
    const text = line.replace(TIMESTAMP, '').trim()
    for (const stamp of stamps) {
      const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0
      lines.push({ time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, text })
    }
  }

  // In LRC a positive offset makes the lyrics appear earlier.
  return lines
    .map((line) => ({ ...line, time: Math.max(0, line.time - offsetMs / 1000) }))
    .sort((a, b) => a.time - b.time)
}

/** Index of the line being sung at `position` seconds: the last one that has started, or -1 before the first. */
export function activeLine(lines: LyricLine[], position: number): number {
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (lines[middle].time <= position) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}
