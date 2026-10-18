import { useSyncExternalStore } from 'react'
import { SLEEP_FADE_MS } from '../../../shared/sleep'
import { cancelFade, fadeOutAndPause, stopAfterCurrentTrack } from './player'
import { showToast } from './toast'

export type SleepState =
  { mode: 'off' } | { mode: 'timer'; endsAt: number; remainingMs: number } | { mode: 'track' }

const OFF: SleepState = { mode: 'off' }
const TICK_MS = 1000
const STOPPED = 'Таймер сна: музыка остановлена'

let state: SleepState = OFF
let ticker: ReturnType<typeof setInterval> | null = null
let fading = false
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function set(next: SleepState): void {
  state = next
  listeners.forEach((listener) => listener())
}

export const useSleep = (): SleepState => useSyncExternalStore(subscribe, () => state)

function stopTicking(): void {
  if (ticker !== null) clearInterval(ticker)
  ticker = null
  fading = false
}

/** Turns the timer off; a fade that already began is undone, so the music comes back at its volume. */
export function cancelSleep(): void {
  stopTicking()
  cancelFade()
  stopAfterCurrentTrack(null)
  set(OFF)
}

/** Stops the music after `minutes`, fading it out over the last seconds. */
export function startSleepTimer(minutes: number): void {
  cancelSleep()
  const endsAt = Date.now() + minutes * 60_000
  set({ mode: 'timer', endsAt, remainingMs: endsAt - Date.now() })
  ticker = setInterval(() => {
    const remainingMs = endsAt - Date.now()
    if (remainingMs > SLEEP_FADE_MS) {
      set({ mode: 'timer', endsAt, remainingMs })
      return
    }
    if (!fading) {
      fading = true
      fadeOutAndPause(Math.max(remainingMs, 1))
    }
    if (remainingMs > 0) {
      set({ mode: 'timer', endsAt, remainingMs })
      return
    }
    stopTicking()
    set(OFF)
    showToast(STOPPED)
  }, TICK_MS)
}

/** Lets the current track play to its end and stops there. */
export function sleepAfterTrack(): void {
  cancelSleep()
  set({ mode: 'track' })
  stopAfterCurrentTrack(() => {
    set(OFF)
    showToast(STOPPED)
  })
}
