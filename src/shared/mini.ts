/** What the always-on-top mini player shows, and how it is placed and controlled. */

export type MiniAnchor = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br'

export const MINI_ANCHORS: MiniAnchor[] = ['tl', 'tc', 'tr', 'bl', 'bc', 'br']

/** The global shortcut that shows and hides the card, and how to write it for the user. Windows has its own. */
export function miniShortcut(platform: string): { accelerator: string; label: string } {
  return platform === 'win32'
    ? { accelerator: 'Control+Shift+1', label: 'Ctrl + Shift + 1' }
    : { accelerator: 'CommandOrControl+Alt+M', label: '⌘/Ctrl + Alt + M' }
}

/** The default size of the card; the user can change it within MINI_LIMITS. */
export const MINI_SIZE = { width: 420, height: 188 }
const MINI_MARGIN = 32
export const MINI_LIMITS = {
  width: { min: 320, max: 640 },
  height: { min: 150, max: 260 },
  /** How opaque the card's own background is; the text and the buttons stay fully visible. */
  opacity: { min: 0.2, max: 1 }
}
/** How much taller the card gets while it shows a line of the lyrics under the controls. */
export const MINI_LYRICS_HEIGHT = 44

export type MiniCommand = 'toggle' | 'prev' | 'next' | 'like' | 'dislike' | 'open'

const COMMANDS: MiniCommand[] = ['toggle', 'prev', 'next', 'like', 'dislike', 'open']

export interface MiniTrack {
  title: string
  artist: string
  coverUri?: string
  playing: boolean
  liked: boolean
  /** The line of the lyrics being sung now, or a short note when there is none. Empty while nothing is known. */
  line: string
}

/** How the card looks, apart from where it is. */
export interface MiniLook {
  /** Opacity of the card's background, MINI_LIMITS.opacity. */
  opacity: number
  width: number
  /** Height of the card without the lyrics line. */
  height: number
  /** The card is opened downwards to show a line of the lyrics. */
  lyrics: boolean
}

export const DEFAULT_MINI_LOOK: MiniLook = {
  opacity: 1,
  width: MINI_SIZE.width,
  height: MINI_SIZE.height,
  lyrics: false
}

export interface MiniConfig extends MiniLook {
  anchor: MiniAnchor
  /** Set once the card was dragged somewhere; picking an anchor clears it. */
  custom?: { x: number; y: number }
}

export const DEFAULT_MINI_CONFIG: MiniConfig = { anchor: 'bc', ...DEFAULT_MINI_LOOK }

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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Applies the fields of `patch` that are valid onto `current`, each kept inside its limits. */
export function mergeMiniLook(current: MiniLook, patch: unknown): MiniLook {
  const input = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>
  const number = (key: string, fallback: number, min: number, max: number, digits = 0): number => {
    const value = input[key]
    if (!isNumber(value)) return fallback
    const step = 10 ** digits
    return Math.round(clamp(value, min, max) * step) / step
  }
  const { width, height, opacity } = MINI_LIMITS
  return {
    opacity: number('opacity', current.opacity, opacity.min, opacity.max, 2),
    width: number('width', current.width, width.min, width.max),
    height: number('height', current.height, height.min, height.max),
    lyrics: typeof input.lyrics === 'boolean' ? input.lyrics : current.lyrics
  }
}

/** The size of the card's window: the card itself, plus the lyrics line when it is open. */
export function miniWindowSize(look: MiniLook): { width: number; height: number } {
  return { width: look.width, height: look.height + (look.lyrics ? MINI_LYRICS_HEIGHT : 0) }
}

/** The cover grows and shrinks with the card, between a size that is still readable and one that is not silly. */
export function miniArtSize(height: number): number {
  return clamp(Math.round(height - 104), 56, 140)
}

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
  const look = mergeMiniLook(DEFAULT_MINI_LOOK, input)
  const custom = input.custom as Record<string, unknown> | undefined
  if (custom && isNumber(custom.x) && isNumber(custom.y)) {
    return { anchor, ...look, custom: { x: Math.round(custom.x), y: Math.round(custom.y) } }
  }
  return { anchor, ...look }
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
    liked: input.liked === true,
    line: typeof input.line === 'string' ? input.line.slice(0, 300) : ''
  }
}
