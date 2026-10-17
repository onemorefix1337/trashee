export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface WindowBounds extends Size {
  x?: number
  y?: number
  maximized: boolean
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

// A saved position counts only if at least this much of the window is on a screen that still exists.
const MIN_VISIBLE: Size = { width: 200, height: 100 }

function visible(window: Rect, area: Rect): boolean {
  const width = Math.min(window.x + window.width, area.x + area.width) - Math.max(window.x, area.x)
  const height =
    Math.min(window.y + window.height, area.y + area.height) - Math.max(window.y, area.y)
  return width >= MIN_VISIBLE.width && height >= MIN_VISIBLE.height
}

/**
 * Turns whatever was saved into window bounds that are safe to use now: a size no smaller than `min`,
 * and a position only if it is still on one of the screens (a monitor may have been unplugged).
 */
export function restoreBounds(
  saved: unknown,
  workAreas: Rect[],
  fallback: Size,
  min: Size
): WindowBounds {
  const input = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>
  const width = isNumber(input.width)
    ? Math.max(min.width, Math.round(input.width))
    : fallback.width
  const height = isNumber(input.height)
    ? Math.max(min.height, Math.round(input.height))
    : fallback.height
  const maximized = input.maximized === true

  if (isNumber(input.x) && isNumber(input.y)) {
    const window = { x: Math.round(input.x), y: Math.round(input.y), width, height }
    if (workAreas.some((area) => visible(window, area))) {
      return { ...window, maximized }
    }
  }
  return { width, height, maximized }
}
