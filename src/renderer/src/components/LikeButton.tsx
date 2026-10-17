import { useState, type JSX } from 'react'
import { motion } from 'motion/react'
import type { Track } from '../../../shared/types'
import { toggleLike, usePlayer } from '../store/player'
import { HeartIcon } from './Icons'

const PARTICLES = 8
const RADIUS = 26

/** Heart with a pop and a ring of particles when a track gets liked. */
export default function LikeButton({
  track,
  size = 20
}: {
  track: Track
  size?: number
}): JSX.Element {
  const liked = usePlayer((s) => s.likedIds.has(track.id))
  const [bursts, setBursts] = useState(0)

  return (
    <motion.button
      className={`icon-btn like${liked ? ' on' : ''}`}
      aria-label={liked ? 'Убрать из любимых' : 'В любимые'}
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.8 }}
      onClick={(event) => {
        event.stopPropagation()
        if (!liked) setBursts((n) => n + 1)
        void toggleLike(track)
      }}
    >
      <motion.span
        className="heart"
        animate={
          liked
            ? { scale: [1, 1.5, 0.85, 1.12, 1], rotate: [0, -12, 8, 0, 0] }
            : { scale: 1, rotate: 0 }
        }
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <HeartIcon filled={liked} size={size} />
      </motion.span>

      {bursts > 0 && liked && (
        <span key={bursts} className="burst" aria-hidden="true">
          {Array.from({ length: PARTICLES }, (_, i) => {
            const angle = (i / PARTICLES) * Math.PI * 2
            return (
              <motion.i
                key={i}
                initial={{ x: 0, y: 0, scale: 0.6, opacity: 1 }}
                animate={{
                  x: Math.cos(angle) * RADIUS,
                  y: Math.sin(angle) * RADIUS,
                  scale: 0,
                  opacity: 0
                }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            )
          })}
        </span>
      )}
    </motion.button>
  )
}
