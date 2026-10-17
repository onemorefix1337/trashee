import { useId, type JSX } from 'react'

// Same five bars as resources/icon.svg: x offset from the first bar, and height.
const BARS = [
  { x: 0, y: 150, height: 200 },
  { x: 100, y: 70, height: 360 },
  { x: 200, y: 0, height: 500 },
  { x: 300, y: 100, height: 300 },
  { x: 400, y: 170, height: 160 }
]

/** The trashee mark; with `animated` the bars bounce like an equalizer. */
export default function Logo({
  size = 96,
  animated = false
}: {
  size?: number
  animated?: boolean
}): JSX.Element {
  const gradient = useId()
  return (
    <svg
      className={`logo${animated ? ' animated' : ''}`}
      width={size}
      height={(size * 540) / 504}
      viewBox="-20 -20 504 540"
      role="img"
      aria-label="trashee"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6b8b" />
          <stop offset="0.55" stopColor="#ff9a62" />
          <stop offset="1" stopColor="#8f6bff" />
        </linearGradient>
      </defs>
      {BARS.map((bar, i) => (
        <rect
          key={bar.x}
          className="logo-bar"
          x={bar.x}
          y={bar.y}
          width={64}
          height={bar.height}
          rx={32}
          fill={`url(#${gradient})`}
          style={{ animationDelay: `${-i * 0.23}s`, animationDuration: `${1.1 + (i % 3) * 0.25}s` }}
        />
      ))}
    </svg>
  )
}
