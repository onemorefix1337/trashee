import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { INITIAL_UPDATE_STATE, type AppInfo, type UpdateState } from '../../../shared/update'

let state: UpdateState = INITIAL_UPDATE_STATE
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const apply = (next: UpdateState): void => {
  state = next
  listeners.forEach((listener) => listener())
}

export const useUpdate = (): UpdateState => useSyncExternalStore(subscribe, () => state)

/** The main process owns the updater; this mirrors its state and follows every change. */
export function connectUpdates(): () => void {
  let stale = false
  void window.api.update.get().then((current) => !stale && apply(current))
  const stop = window.api.update.onState(apply)
  return () => {
    stale = true
    stop()
  }
}

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    let stale = false
    void window.api.appInfo().then((value) => !stale && setInfo(value))
    return () => {
      stale = true
    }
  }, [])
  return info
}

export const formatBytes = (bytes: number): string =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(bytes >= 104857600 ? 0 : 1)} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`
