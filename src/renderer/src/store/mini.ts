import { useSyncExternalStore } from 'react'
import { DEFAULT_MINI_CONFIG, type MiniAnchor } from '../../../shared/mini'

let visible = false
let anchor: MiniAnchor = DEFAULT_MINI_CONFIG.anchor
const listeners = new Set<() => void>()

const notify = (): void => listeners.forEach((listener) => listener())

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useMiniVisible = (): boolean => useSyncExternalStore(subscribe, () => visible)
export const useMiniAnchor = (): MiniAnchor => useSyncExternalStore(subscribe, () => anchor)

/** The main process owns the mini player; this mirrors whether it is shown and where it is pinned. */
export function connectMini(): () => void {
  let stale = false
  void window.api.miniConfig().then((config) => {
    if (stale) return
    visible = config.visible
    anchor = config.anchor
    notify()
  })
  const stop = window.api.onMiniVisible((value) => {
    visible = value
    notify()
  })
  return () => {
    stale = true
    stop()
  }
}

export function toggleMini(): void {
  void window.api.miniToggle()
}

export function setMiniAnchor(next: MiniAnchor): void {
  anchor = next
  notify()
  void window.api.miniSetAnchor(next)
}
