import type { JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { artistNames, coverUrl } from '../lib/cover'
import { currentTrack, next, previous, toggle, usePlayer } from '../store/player'
import Marquee from './Marquee'
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from './Icons'

export default function MiniBar({ onOpen }: { onOpen: () => void }): JSX.Element | null {
  const track = usePlayer(currentTrack)
  const playing = usePlayer((s) => s.playing)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  if (!track) return null

  const cover = coverUrl(track, '100x100')
  return (
    <motion.div
      className="mini-bar"
      initial={{ y: 100, opacity: 0, scale: 0.94 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 100, opacity: 0, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
    >
      <div
        className="mini-progress"
        style={{ transform: `scaleX(${duration ? position / duration : 0})` }}
      />
      <motion.button className="mini-info" onClick={onOpen} whileTap={{ scale: 0.98 }}>
        <div className={`thumb${playing ? ' spin-glow' : ''}`}>
          <AnimatePresence initial={false}>
            {cover && (
              <motion.img
                key={track.id}
                src={cover}
                alt=""
                initial={{ opacity: 0, scale: 1.2 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              />
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={track.id}
            className="meta"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
          >
            <Marquee className="title">{track.title}</Marquee>
            <Marquee className="artist">{artistNames(track)}</Marquee>
          </motion.div>
        </AnimatePresence>
      </motion.button>
      <div className="mini-controls">
        <motion.button
          className="icon-btn"
          onClick={() => void previous()}
          aria-label="Предыдущий"
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.85, x: -3 }}
        >
          <PrevIcon />
        </motion.button>
        <motion.button
          className="icon-btn big"
          onClick={toggle}
          aria-label={playing ? 'Пауза' : 'Играть'}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.88 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={playing ? 'pause' : 'play'}
              className="swap"
              initial={{ scale: 0.4, opacity: 0, rotate: -50 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0, rotate: 50 }}
              transition={{ duration: 0.14 }}
            >
              {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        <motion.button
          className="icon-btn"
          onClick={() => void next()}
          aria-label="Следующий"
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.85, x: 3 }}
        >
          <NextIcon />
        </motion.button>
      </div>
    </motion.div>
  )
}
