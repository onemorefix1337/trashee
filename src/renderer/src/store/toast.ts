import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

const DEFAULT_MS = 7000

let toast: Toast | null = null
let nextId = 0
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function set(next: Toast | null): void {
  toast = next
  listeners.forEach((listener) => listener())
}

export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, () => toast)
}

export function dismissToast(): void {
  clearTimeout(timer)
  set(null)
}

/** One toast at a time: a new one replaces the old. An action (like "Undo") runs once and closes it. */
export function showToast(text: string, action?: Toast['action'], ms = DEFAULT_MS): void {
  clearTimeout(timer)
  const id = ++nextId
  set({
    id,
    text,
    action: action && {
      label: action.label,
      run: () => {
        dismissToast()
        action.run()
      }
    }
  })
  timer = setTimeout(() => toast?.id === id && dismissToast(), ms)
}
