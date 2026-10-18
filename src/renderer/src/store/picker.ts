import { useSyncExternalStore } from 'react'
import type { Track } from '../../../shared/types'

let target: Track | null = null
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function set(next: Track | null): void {
  target = next
  listeners.forEach((listener) => listener())
}

/** The track the "add to playlist" window is open for, or null while it is closed. */
export const usePickerTrack = (): Track | null => useSyncExternalStore(subscribe, () => target)

export const openPlaylistPicker = (track: Track): void => set(track)
export const closePlaylistPicker = (): void => set(null)
