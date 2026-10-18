import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  DEFAULT_MINI_CONFIG,
  DEFAULT_MINI_LOOK,
  mergeMiniLook,
  type MiniAnchor,
  type MiniLook
} from '../../../shared/mini'
import { miniLine } from '../../../shared/lrc'
import type { Lyrics, Track } from '../../../shared/types'
import { cachedLyrics, loadLyrics } from '../lib/lyrics'
import { usePlayer } from './player'

let visible = false
let anchor: MiniAnchor = DEFAULT_MINI_CONFIG.anchor
let look: MiniLook = DEFAULT_MINI_LOOK
const listeners = new Set<() => void>()

const notify = (): void => listeners.forEach((listener) => listener())

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useMiniVisible = (): boolean => useSyncExternalStore(subscribe, () => visible)
export const useMiniAnchor = (): MiniAnchor => useSyncExternalStore(subscribe, () => anchor)
export const useMiniLook = (): MiniLook => useSyncExternalStore(subscribe, () => look)

/** The main process owns the mini player; this mirrors whether it is shown and where it is pinned. */
export function connectMini(): () => void {
  let stale = false
  void window.api.miniConfig().then((config) => {
    if (stale) return
    visible = config.visible
    anchor = config.anchor
    look = mergeMiniLook(DEFAULT_MINI_LOOK, config)
    notify()
  })
  const stopVisible = window.api.onMiniVisible((value) => {
    visible = value
    notify()
  })
  // The card opens its own lyrics line, so the look can change without the settings page doing anything.
  const stopLook = window.api.onMiniLook((value) => {
    look = value
    notify()
  })
  return () => {
    stale = true
    stopVisible()
    stopLook()
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

/** Size, opacity and the lyrics line of the card; the main process applies them to its window. */
export function setMiniLook(patch: Partial<MiniLook>): void {
  look = mergeMiniLook(look, patch)
  notify()
  void window.api.miniSetLook(patch)
}

/**
 * The line of the lyrics for the card, while the card is shown with its lyrics open. Only a change of the
 * line re-renders the caller, not every tick of the position.
 */
export function useMiniLine(track: Track | undefined, enabled: boolean): string {
  const [loaded, setLoaded] = useState<{ id: string; lyrics: Lyrics } | null>(null)
  useEffect(() => {
    if (!track || !enabled) return
    let stale = false
    loadLyrics(track)
      .then((lyrics) => !stale && setLoaded({ id: track.id, lyrics }))
      .catch(() => undefined) // no line is shown; the lyrics panel offers a retry
    return () => {
      stale = true
    }
  }, [track, enabled])

  const known =
    enabled && track ? (loaded?.id === track.id ? loaded.lyrics : cachedLyrics(track.id)) : null
  return usePlayer((state) => (known ? miniLine(known, state.position) : ''))
}
