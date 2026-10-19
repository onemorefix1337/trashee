import { useSyncExternalStore } from 'react'
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../../../shared/settings'

const KEY = 'trashee.settings'

function load(): Settings {
  try {
    return sanitizeSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return DEFAULT_SETTINGS
  }
}

let settings = load()
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSettings<T>(select: (settings: Settings) => T): T {
  return useSyncExternalStore(subscribe, () => select(settings))
}

/** For code that is not a component: told whenever a setting changes. */
export function subscribeSettings(listener: () => void): () => void {
  return subscribe(listener)
}

export function getSettings(): Settings {
  return settings
}

export function updateSettings(patch: Partial<Settings>): void {
  settings = sanitizeSettings({ ...settings, ...patch })
  listeners.forEach((listener) => listener())
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* settings just will not survive a restart */
  }
}
