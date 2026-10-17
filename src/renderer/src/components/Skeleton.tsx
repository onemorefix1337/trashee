import type { JSX } from 'react'

/** Shimmering placeholder rows with the same geometry as track rows. */
export default function Skeleton({ rows }: { rows: number }): JSX.Element {
  return (
    <div className="track-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row skeleton" style={{ animationDelay: `${i * 70}ms` }}>
          <div className="thumb shimmer" />
          <div className="meta">
            <div className="bar shimmer" style={{ width: `${48 + ((i * 17) % 34)}%` }} />
            <div className="bar short shimmer" style={{ width: `${24 + ((i * 11) % 22)}%` }} />
          </div>
          <span />
          <span />
        </div>
      ))}
    </div>
  )
}
