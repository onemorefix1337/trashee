import type { JSX } from 'react'

interface Props {
  value: number
  max: number
  label: string
  onChange: (value: number) => void
  /** Smooth the fill between updates (for the playback position, which arrives a few times a second). */
  smooth?: boolean
  step?: number
}

/** Range input with a custom animated track: the real input stays on top, invisible, for pointer and keyboard. */
export default function SeekBar({
  value,
  max,
  label,
  onChange,
  smooth = false,
  step = 0.01
}: Props): JSX.Element {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  return (
    <div className={`seekbar${smooth ? ' smooth' : ''}`}>
      <div className="seek-track">
        <div className="seek-fill" style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <div className="seek-thumb" style={{ left: `${ratio * 100}%` }} />
      <input
        type="range"
        min={0}
        max={Math.max(max, step)}
        step={step}
        value={Math.min(value, max)}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
    </div>
  )
}
