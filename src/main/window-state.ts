import { app, screen, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { restoreBounds, type WindowBounds } from '../shared/window-bounds'

const DEFAULT_SIZE = { width: 1180, height: 780 }
export const MIN_SIZE = { width: 860, height: 600 }
const SAVE_DELAY_MS = 400

const stateFile = (): string => join(app.getPath('userData'), 'window.json')

/** Where the window was last time, corrected for screens that are no longer there. */
export function loadWindowBounds(): WindowBounds {
  let saved: unknown = null
  try {
    saved = JSON.parse(readFileSync(stateFile(), 'utf8'))
  } catch {
    /* first launch, or an unreadable file: use the defaults */
  }
  const workAreas = screen.getAllDisplays().map((display) => display.workArea)
  return restoreBounds(saved, workAreas, DEFAULT_SIZE, MIN_SIZE)
}

/** Remembers size, position and maximized state, saving shortly after the user stops dragging. */
export function trackWindowBounds(window: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | undefined

  const save = (): void => {
    clearTimeout(timer)
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return
    const state = { ...window.getNormalBounds(), maximized: window.isMaximized() }
    try {
      writeFileSync(stateFile(), JSON.stringify(state))
    } catch {
      /* losing the window position is not worth an error */
    }
  }
  const saveSoon = (): void => {
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY_MS)
  }

  window.on('resize', saveSoon)
  window.on('move', saveSoon)
  window.on('close', save)
}
