/** Choices of the sleep timer, in minutes. */
export const SLEEP_MINUTES = [15, 30, 45, 60, 90]

/** The music fades out over this long before the timer stops it. */
export const SLEEP_FADE_MS = 15_000

/**
 * How loud the music is `elapsed` ms into a fade that lasts `total` ms, as a share of where it started.
 * It falls with the square of the remaining time, which sounds even to the ear; a straight line seems to drop at the end.
 */
export function fadeLevel(elapsed: number, total: number): number {
  if (total <= 0) return 0
  const left = Math.min(1, Math.max(0, 1 - elapsed / total))
  return left * left
}

/** "12:30" below an hour, "1:05:00" from an hour; never negative. */
export function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = String(seconds % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}
