import { useEffect, useRef, type JSX } from 'react'
import { getAnalyser, usePlayer } from '../store/player'

const BARS = 72
const FIRST_BIN = 2
const LAST_BIN = 300
const RELEASE = 0.9
const SETTLED = 0.004

/** Log-spaced spectrum bars along the bottom edge, tinted with the accent color of the cover. */
export default function Visualizer(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const playing = usePlayer((s) => s.playing)

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context) return

    const levels = new Float32Array(BARS)
    const ranges = Array.from({ length: BARS }, (_, i) => {
      const lo = Math.round(FIRST_BIN * (LAST_BIN / FIRST_BIN) ** (i / BARS))
      const hi = Math.round(FIRST_BIN * (LAST_BIN / FIRST_BIN) ** ((i + 1) / BARS))
      return [lo, Math.max(hi, lo + 1)] as const
    })
    let spectrum: Uint8Array<ArrayBuffer> | null = null
    let width = 0
    let height = 0
    let rgb = '255, 255, 255'
    let frame = 0
    let raf = 0

    const resize = (): void => {
      const ratio = window.devicePixelRatio || 1
      const box = element.getBoundingClientRect()
      width = box.width
      height = box.height
      element.width = Math.round(width * ratio)
      element.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)

    const readColor = (): void => {
      const style = getComputedStyle(document.documentElement)
      const channel = (name: string): number =>
        Math.round(Number(style.getPropertyValue(name)) || 255)
      rgb = `${channel('--ar')}, ${channel('--ag')}, ${channel('--ab')}`
    }

    const draw = (): void => {
      const analyser = playing ? getAnalyser() : null
      if (analyser) {
        spectrum ??= new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(spectrum)
      }

      let peak = 0
      for (let i = 0; i < BARS; i++) {
        let target = 0
        if (analyser && spectrum) {
          const [lo, hi] = ranges[i]
          let sum = 0
          for (let bin = lo; bin < hi; bin++) sum += spectrum[bin]
          // Highs carry less energy, so lift them a little to keep the whole row alive.
          target = Math.min(1, (sum / (hi - lo) / 255) * (1 + (i / BARS) * 0.9)) ** 1.25
        }
        levels[i] = Math.max(target, levels[i] * RELEASE)
        peak = Math.max(peak, levels[i])
      }

      if (frame++ % 20 === 0) readColor()
      context.clearRect(0, 0, width, height)
      const fill = context.createLinearGradient(0, height, 0, 0)
      fill.addColorStop(0, `rgba(${rgb}, 0.4)`)
      fill.addColorStop(1, `rgba(${rgb}, 0)`)
      context.fillStyle = fill

      const step = width / BARS
      const barWidth = Math.max(2, step * 0.62)
      for (let i = 0; i < BARS; i++) {
        const barHeight = Math.max(3, levels[i] * height * 0.95)
        context.beginPath()
        context.roundRect(
          i * step + (step - barWidth) / 2,
          height - barHeight,
          barWidth,
          barHeight,
          barWidth / 2
        )
        context.fill()
      }

      // Keep animating while playing, and until the bars have fallen back down.
      if (playing || peak > SETTLED) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [playing])

  return <canvas ref={canvas} className="visualizer" aria-hidden="true" />
}
