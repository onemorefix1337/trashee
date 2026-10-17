import type { JSX, ReactNode } from 'react'
import { motion } from 'motion/react'
import { coverUrl } from '../lib/cover'
import { PinIcon } from './Icons'

interface Props {
  coverUri?: string
  title: string
  subtitle: string
  index: number
  onClick: () => void
  /** Shown instead of the cover when there is none. */
  fallback: ReactNode
  pinned?: boolean
}

/** A square cover with a title and a line of detail, for grids of playlists and albums. */
export default function CoverCard({
  coverUri,
  title,
  subtitle,
  index,
  onClick,
  fallback,
  pinned = false
}: Props): JSX.Element {
  const cover = coverUrl({ coverUri }, '300x300')
  return (
    <motion.button
      className="card"
      onClick={onClick}
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.97 }}
      transition={{
        type: 'spring',
        stiffness: 280,
        damping: 24,
        delay: Math.min(index, 12) * 0.035
      }}
    >
      <div className="card-cover">
        {cover ? <img src={cover} alt="" loading="lazy" /> : fallback}
        {pinned && (
          <span className="card-pin" title="Закреплён">
            <PinIcon size={14} filled />
          </span>
        )}
      </div>
      <div className="card-title">{title}</div>
      <div className="card-sub">{subtitle}</div>
    </motion.button>
  )
}
