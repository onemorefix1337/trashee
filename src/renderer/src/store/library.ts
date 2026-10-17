import { useSyncExternalStore } from 'react'
import { refKey } from '../../../shared/collections'
import type { CollectionRef, Pin } from '../../../shared/types'

let pins: Pin[] = []
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setPins(next: Pin[]): void {
  pins = next
  listeners.forEach((listener) => listener())
}

export function usePins(): Pin[] {
  return useSyncExternalStore(subscribe, () => pins)
}

export function useIsPinned(ref: CollectionRef | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ref !== undefined && pins.some((p) => p.key === refKey(ref))
  )
}

export async function loadPins(): Promise<void> {
  try {
    setPins(await window.api.pins())
  } catch {
    /* the sidebar just stays as it was */
  }
}

const TYPE_LABEL = { playlist: 'Плейлист', album: 'Альбом', artist: 'Исполнитель' } as const

/** Pins or unpins right away and rolls back if the server refuses. */
export async function setPinned(
  ref: CollectionRef,
  pinned: boolean,
  meta: { title: string; coverUri?: string }
): Promise<void> {
  const key = refKey(ref)
  const before = pins
  const without = before.filter((pin) => pin.key !== key)
  setPins(
    pinned
      ? [
          ...without,
          {
            key,
            type: ref.type,
            title: meta.title,
            subtitle: TYPE_LABEL[ref.type],
            coverUri: meta.coverUri,
            ref
          }
        ]
      : without
  )
  try {
    await window.api.setPin(ref, pinned)
    await loadPins()
  } catch (error) {
    setPins(before)
    throw error
  }
}

export function resetLibrary(): void {
  setPins([])
}
