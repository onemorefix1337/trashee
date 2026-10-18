import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import type { CacheInfo, CollectionRef, OfflineProgress, OfflineState } from '../../../shared/types'
import { refKey } from '../../../shared/collections'
import { artistNames } from '../lib/cover'
import { showToast } from './toast'
import type { Track } from '../../../shared/types'

let state: OfflineState = {}
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const apply = (next: OfflineState): void => {
  state = next
  listeners.forEach((listener) => listener())
}

/** The main process does the saving; this follows it. */
export function connectOffline(): () => void {
  let stale = false
  void window.api.offlineState().then((current) => !stale && apply(current))
  const stop = window.api.onOfflineState(apply)
  return () => {
    stale = true
    stop()
  }
}

export const keyOf = (target: 'liked' | CollectionRef): string =>
  target === 'liked' ? 'liked' : refKey(target)

export function useOfflineProgress(key: string): OfflineProgress | undefined {
  return useSyncExternalStore(subscribe, () => state[key])
}

export function saveOffline(target: 'liked' | CollectionRef, title: string): void {
  void window.api
    .saveOffline(target)
    .then(() => showToast(`«${title}» сохранено для прослушивания без сети`))
    .catch(() => showToast(`Не удалось сохранить «${title}»`))
}

export function removeOffline(key: string, title: string): void {
  void window.api.removeOffline(key)
  showToast(`«${title}» убрано из сохранённого`)
}

/** Sizes of the caches and the list of saved collections; reloads whenever saving changes something. */
export function useCacheInfo(): { info: CacheInfo | null; reload: () => void } {
  const [info, setInfo] = useState<CacheInfo | null>(null)
  const [tick, setTick] = useState(0)
  const progress = useSyncExternalStore(subscribe, () => state)
  const busy = Object.values(progress).some((entry) => entry.status === 'saving')
  const count = Object.keys(progress).length
  useEffect(() => {
    let stale = false
    void window.api.cacheInfo().then((value) => !stale && setInfo(value))
    return () => {
      stale = true
    }
    // Sizes change when a collection starts or finishes saving, not on every track.
  }, [tick, busy, count])
  return { info, reload: () => setTick((n) => n + 1) }
}

/** Saves one track as a file in the Downloads folder and offers to show it. */
export async function downloadTrackFile(track: Track): Promise<void> {
  showToast(`Скачиваем «${track.title}»…`)
  try {
    const path = await window.api.downloadTrack({
      id: track.id,
      title: track.title,
      artists: track.artists.map((artist) => artist.name)
    })
    const name = path.split(/[\\/]/).pop() ?? track.title
    showToast(`Сохранено: ${name}`, { label: 'Показать', run: () => void window.api.reveal(path) })
  } catch {
    showToast(`Не удалось скачать «${track.title}» (${artistNames(track)})`)
  }
}

export const formatBytes = (bytes: number): string =>
  bytes >= 1073741824
    ? `${(bytes / 1073741824).toFixed(1)} ГБ`
    : bytes >= 1048576
      ? `${Math.round(bytes / 1048576)} МБ`
      : bytes > 0
        ? `${Math.max(1, Math.round(bytes / 1024))} КБ`
        : '0'
