import type { MiniTrack } from './mini'

export type TrayAction = 'toggle' | 'prev' | 'next' | 'show' | 'mini' | 'quit'

export interface TrayEntry {
  id?: TrayAction
  label?: string
  enabled?: boolean
  separator?: boolean
}

const TITLE_LIMIT = 42

const shorten = (text: string): string =>
  text.length > TITLE_LIMIT ? `${text.slice(0, TITLE_LIMIT - 1)}…` : text

/** The entries of the tray (or menu bar) menu for what is playing now. */
export function trayEntries(
  track: MiniTrack | null,
  windowVisible: boolean,
  miniVisible: boolean
): TrayEntry[] {
  const playing = track?.playing === true
  return [
    {
      label: track
        ? shorten(`${track.title}${track.artist ? ` — ${track.artist}` : ''}`)
        : 'Ничего не играет',
      enabled: false
    },
    { separator: true },
    { id: 'toggle', label: playing ? 'Пауза' : 'Играть', enabled: track !== null },
    { id: 'prev', label: 'Предыдущий', enabled: track !== null },
    { id: 'next', label: 'Следующий', enabled: track !== null },
    { separator: true },
    { id: 'show', label: windowVisible ? 'Спрятать окно' : 'Показать окно' },
    { id: 'mini', label: miniVisible ? 'Скрыть мини-плеер' : 'Мини-плеер' },
    { separator: true },
    { id: 'quit', label: 'Выйти из trashee' }
  ]
}

export interface Bitmap {
  data: Uint8Array
  width: number
  height: number
}

// The five bars of the logo: the height of each as a share of the tallest.
const BARS = [0.4, 0.72, 1, 0.6, 0.32]
const SUPERSAMPLE = 4

/**
 * The logo's five bars as a BGRA bitmap with premultiplied alpha, which is what the system tray takes.
 * `color` picks the color of a row (0 at the top) so the same drawing serves a flat template icon and the gradient one.
 */
export function barsBitmap(size: number, color: (row: number) => [number, number, number]): Bitmap {
  const big = size * SUPERSAMPLE
  const coverage = new Float32Array(size * size)
  const slot = big / (BARS.length * 2 + 1)
  const barWidth = slot * 1.35
  const gap = (big - barWidth * BARS.length) / (BARS.length + 1)
  const radius = barWidth / 2

  BARS.forEach((share, bar) => {
    const left = gap + bar * (barWidth + gap)
    const height = big * 0.9 * share
    const top = (big - height) / 2
    for (let y = Math.floor(top); y < Math.ceil(top + height); y++) {
      for (let x = Math.floor(left); x < Math.ceil(left + barWidth); x++) {
        const dx = Math.max(left + radius - x - 0.5, x + 0.5 - (left + barWidth - radius), 0)
        const dy = Math.max(top + radius - y - 0.5, y + 0.5 - (top + height - radius), 0)
        if (dx * dx + dy * dy > radius * radius) continue
        coverage[Math.floor(y / SUPERSAMPLE) * size + Math.floor(x / SUPERSAMPLE)] +=
          1 / (SUPERSAMPLE * SUPERSAMPLE)
      }
    }
  })

  const data = new Uint8Array(size * size * 4)
  for (let row = 0; row < size; row++) {
    const [r, g, b] = color(row)
    for (let column = 0; column < size; column++) {
      const alpha = Math.min(1, coverage[row * size + column])
      const at = (row * size + column) * 4
      data[at] = Math.round(b * alpha)
      data[at + 1] = Math.round(g * alpha)
      data[at + 2] = Math.round(r * alpha)
      data[at + 3] = Math.round(255 * alpha)
    }
  }
  return { data, width: size, height: size }
}
