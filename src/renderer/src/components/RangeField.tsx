import type { JSX } from 'react'
import SeekBar from './SeekBar'

/** A slider with its value written next to it; `min` can be above zero, which SeekBar itself does not know. */
export default function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format: (value: number) => string
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <div className="range-field">
      <SeekBar
        label={label}
        value={value - min}
        max={max - min}
        step={step}
        onChange={(offset) => onChange(offset + min)}
      />
      <span className="range-value">{format(value)}</span>
    </div>
  )
}
