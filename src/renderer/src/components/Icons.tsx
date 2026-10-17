import type { JSX, ReactNode } from 'react'

function Svg({
  children,
  size = 20,
  fill = false
}: {
  children: ReactNode
  size?: number
  fill?: boolean
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

type IconProps = { size?: number }

export const PlayIcon = (p: IconProps): JSX.Element => (
  <Svg {...p} fill>
    <path
      d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"
      stroke="none"
    />
  </Svg>
)
export const PauseIcon = (p: IconProps): JSX.Element => (
  <Svg {...p} fill>
    <rect x="6" y="5" width="4" height="14" rx="1.2" stroke="none" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" stroke="none" />
  </Svg>
)
export const NextIcon = (p: IconProps): JSX.Element => (
  <Svg {...p} fill>
    <path
      d="M6 6.2v11.6a.8.8 0 0 0 1.24.67l8.2-5.8a.8.8 0 0 0 0-1.34l-8.2-5.8A.8.8 0 0 0 6 6.2Z"
      stroke="none"
    />
    <rect x="16.5" y="5.5" width="2.2" height="13" rx="1" stroke="none" />
  </Svg>
)
export const PrevIcon = (p: IconProps): JSX.Element => (
  <Svg {...p} fill>
    <path
      d="M18 6.2v11.6a.8.8 0 0 1-1.24.67l-8.2-5.8a.8.8 0 0 1 0-1.34l8.2-5.8A.8.8 0 0 1 18 6.2Z"
      stroke="none"
    />
    <rect x="5.3" y="5.5" width="2.2" height="13" rx="1" stroke="none" />
  </Svg>
)
export const ShuffleIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M16 4h4v4M4 20 20 4M20 16v4h-4M4 4l5 5M15 15l5 5" />
  </Svg>
)
export const RepeatIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />
  </Svg>
)
export const RepeatOneIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3M11 10h1.5v4" />
  </Svg>
)
export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }): JSX.Element => (
  <Svg {...p} fill={filled}>
    <path d="M19.5 12.6 12 20l-7.5-7.4a5 5 0 0 1 7.1-7.1l.4.4.4-.4a5 5 0 0 1 7.1 7.1Z" />
  </Svg>
)
export const SearchIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)
export const LibraryIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M5 4v16M10 4v16M15.5 5.5l4 14" />
  </Svg>
)
export const WaveIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0M2 17c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />
  </Svg>
)
export const VolumeIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </Svg>
)
export const SimilarIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="8" cy="12" r="5" />
    <circle cx="16" cy="12" r="5" />
  </Svg>
)
export const GearIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Svg>
)
export const PinIcon = ({ filled, ...p }: IconProps & { filled?: boolean }): JSX.Element => (
  <Svg {...p} fill={filled}>
    <path d="m15 4 5 5-3 1-3.5 3.5.5 4-1.5 1.5-3-4.5L5 19.5M9 10.5l-1-3 1.5-1.5 4 .5" />
  </Svg>
)
export const ChevronIcon = ({ flip, ...p }: IconProps & { flip?: boolean }): JSX.Element => (
  <Svg {...p}>
    <path d={flip ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} />
  </Svg>
)
export const PlaylistIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M4 6h11M4 12h11M4 18h7M18 15V5l3 1M18 15a2.5 2.5 0 1 1-2.5-2.5" />
  </Svg>
)
export const ThumbDownIcon = (p: IconProps): JSX.Element => (
  <Svg {...p}>
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 9a2 2 0 0 0 2 2.3H10ZM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
  </Svg>
)
export const MoreIcon = (p: IconProps): JSX.Element => (
  <Svg {...p} fill>
    <circle cx="5" cy="12" r="1.8" stroke="none" />
    <circle cx="12" cy="12" r="1.8" stroke="none" />
    <circle cx="19" cy="12" r="1.8" stroke="none" />
  </Svg>
)
