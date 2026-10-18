/** What the always-on-top mini player shows, and how it is placed and controlled. */

export type MiniAnchor = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'

export const MINI_ANCHORS: MiniAnchor[] = ['tl', 'tc', 'tr', 'bl', 'bc', 'br']

/** The global shortcut that shows and hides the card, and how to write it for the user. Windows has its own. */
export function miniShortcut(platform: string): { accelerator: string; label: string } {
  return platform === 'win32'
    ? { accelerator: 'Control+Shift+1', label: 'Ctrl + Shift + 1' }
    : { accelerator: 'CommandOrControl+Alt+M', label: '⌘/Ctrl + Alt + M' }
}

export const MINI_SIZE = { width: 420, height: 188 }
export const MINI_MARGIN = 32

export type MiniCommand = 'toggle' | 'prev' | 'next' | 'like' | 'dislike' | 'open'

const COMMANDS: MiniCommand[] = ['toggle', 'prev', 'next', 'like', 'dislike', 'open']

export interface MiniTrack {
  title: string
  artist: string
  coverUri?: string
  playing: boolean
  liked: boolean
}

export interface MiniConfig {
  anchor: MiniAnchor
  /** Set once the card was dragged somewhere; picking an anchor clears it. */
  custom?: { x: number; y: number }
}

export const DEFAULT_MINI_CONFIG: MiniConfig = { anchor: 'bc' }

interface Area {
  x: number
  y: number
  width: number
  height: number
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const isMiniAnchor = (value: unknown): value is MiniAnchor =>
  MINI_ANCHORS.includes(value as MiniAnchor)

export const isMiniCommand = (value: unknown): value is MiniCommand =>
  COMMANDS.includes(value as MiniCommand)

/** Top-left corner of a card of `size` pinned to an anchor of the work area. */
export function anchorPosition(
  anchor: MiniAnchor,
  area: Area,
  size: { width: number; height: number } = MINI_SIZE,
  margin = MINI_MARGIN
): { x: number; y: number } {
  const column = anchor[1]
  const x =
    column === 'l'
      ? area.x + margin
      : column === 'r'
        ? area.x + area.width - size.width - margin
        : area.x + Math.round((area.width - size.width) / 2)
  const y = anchor[0] === 't' ? area.y + margin : area.y + area.height - size.height - margin
  return { x, y }
}

/** Takes whatever was stored (possibly damaged) and returns a valid config. */
export function sanitizeMiniConfig(raw: unknown): MiniConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const anchor = isMiniAnchor(input.anchor) ? input.anchor : DEFAULT_MINI_CONFIG.anchor
  const custom = input.custom as Record<string, unknown> | undefined
  if (custom && isNumber(custom.x) && isNumber(custom.y)) {
    return { anchor, custom: { x: Math.round(custom.x), y: Math.round(custom.y) } }
  }
  return { anchor }
}

/** The state sent by the player window, reduced to what the card can show. Null means nothing is playing. */
export function sanitizeMiniTrack(raw: unknown): MiniTrack | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  if (typeof input.title !== 'string') return null
  return {
    title: input.title.slice(0, 300),
    artist: typeof input.artist === 'string' ? input.artist.slice(0, 300) : '',
    coverUri: typeof input.coverUri === 'string' ? input.coverUri.slice(0, 500) : undefined,
    playing: input.playing === true,
    liked: input.liked === true
  }
}
