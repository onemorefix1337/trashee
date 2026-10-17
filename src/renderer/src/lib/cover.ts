import type { Track } from '../../../shared/types'

/** Cover served through the main process (needed to read pixels for the dominant color). */
export function coverUrl(item: { coverUri?: string } | undefined, size = '400x400'): string | null {
  return item?.coverUri
    ? `trashee-media://cover/${encodeURIComponent(item.coverUri)}?size=${size}`
    : null
}

/** Direct public cover URL, for the OS media session which cannot load custom schemes. */
export function publicCoverUrl(track: Track, size = '400x400'): string | null {
  return track.coverUri ? `https://${track.coverUri.replace('%%', size)}` : null
}

export type Rgb = [number, number, number]

const colorCache = new Map<string, Rgb | null>()

/** Saturation-weighted average color of the cover, used to tint the interface. */
export async function dominantColor(url: string): Promise<Rgb | null> {
  if (colorCache.has(url)) return colorCache.get(url) ?? null

  const color = await new Promise<Rgb | null>((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const size = 24
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return resolve(null)
      context.drawImage(image, 0, 0, size, size)
      const { data } = context.getImageData(0, 0, size, size)

      let r = 0
      let g = 0
      let b = 0
      let weight = 0
      for (let i = 0; i < data.length; i += 4) {
        const max = Math.max(data[i], data[i + 1], data[i + 2])
        const min = Math.min(data[i], data[i + 1], data[i + 2])
        if (max < 40 || min > 225) continue
        const w = (max - min) / 255 + 0.05
        r += data[i] * w
        g += data[i + 1] * w
        b += data[i + 2] * w
        weight += w
      }
      resolve(
        weight > 0 ? [Math.round(r / weight), Math.round(g / weight), Math.round(b / weight)] : null
      )
    }
    image.onerror = () => resolve(null)
    image.src = url
  })

  colorCache.set(url, color)
  return color
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function artistNames(track: Track): string {
  return track.artists.map((artist) => artist.name).join(', ')
}

/** "1 трек", "2 трека", "5 треков", "21 трек" */
export function trackWord(count: number): string {
  const lastTwo = count % 100
  const last = count % 10
  const word =
    lastTwo >= 11 && lastTwo <= 14
      ? 'треков'
      : last === 1
        ? 'трек'
        : last >= 2 && last <= 4
          ? 'трека'
          : 'треков'
  return `${count} ${word}`
}
