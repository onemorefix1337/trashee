import { useCallback, useState, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Track } from '../../../shared/types'
import { coverUrl, formatTime } from '../lib/cover'
import { usePlayer } from '../store/player'
import ArtistLinks from './ArtistLinks'
import { MoreIcon } from './Icons'
import LikeButton from './LikeButton'
import TrackMenu, { type MenuPoint } from './TrackMenu'

const STAGGER_SECONDS = 0.028
const STAGGER_ROWS = 14

interface Props {
  tracks: Track[]
  onPlay: (index: number) => void
  /** Index of the track that is playing right now, when the list is the queue. */
  activeIndex?: number
  /** Rows collapse when they leave (the queue loses its first track as playback advances). */
  collapseOnExit?: boolean
}

/** Animated bars on the cover of the playing track; they freeze while paused. */
function Equalizer(): JSX.Element {
  const playing = usePlayer((s) => s.playing)
  return (
    <div className={`eq${playing ? ' on' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  )
}

function Row({
  track,
  index,
  active,
  collapseOnExit,
  onPlay
}: {
  track: Track
  index: number
  active: boolean
  collapseOnExit: boolean
  onPlay: (i: number) => void
}): JSX.Element {
  const cover = coverUrl(track, '100x100')
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  return (
    <motion.div
      className={`row${active ? ' active' : ''}${track.available ? '' : ' unavailable'}`}
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ x: event.clientX, y: event.clientY })
      }}
      initial={{ opacity: 0, y: 14, height: 56 }}
      animate={{ opacity: 1, y: 0, height: 56 }}
      exit={
        collapseOnExit
          ? { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, x: -24 }
          : undefined
      }
      transition={{
        type: 'spring',
        stiffness: 320,
        damping: 30,
        delay: Math.min(index, STAGGER_ROWS) * STAGGER_SECONDS
      }}
      whileTap={track.available ? { scale: 0.985 } : undefined}
      onClick={() => track.available && onPlay(index)}
    >
      <div className="thumb">
        {cover && <img src={cover} alt="" loading="lazy" />}
        {active && <Equalizer />}
      </div>
      <div className="meta">
        <div className="title">
          {track.title}
          {track.version && <span className="version"> {track.version}</span>}
        </div>
        <div className="artist">
          <ArtistLinks artists={track.artists} />
        </div>
      </div>
      <div className="row-actions">
        <LikeButton track={track} size={18} />
        <button
          className={`icon-btn row-more${menu ? ' open' : ''}`}
          aria-label="Ещё"
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation()
            const box = event.currentTarget.getBoundingClientRect()
            setMenu({ x: box.left, y: box.bottom + 4 })
          }}
        >
          <MoreIcon size={18} />
        </button>
      </div>
      <div className="time">{formatTime(track.durationMs / 1000)}</div>
      <TrackMenu track={track} point={menu} onClose={closeMenu} />
    </motion.div>
  )
}

export default function TrackList({
  tracks,
  onPlay,
  activeIndex,
  collapseOnExit = false
}: Props): JSX.Element {
  // The same track can be queued twice, so keys carry the occurrence number.
  const seen = new Map<string, number>()
  const items = tracks.map((track, index) => {
    const occurrence = seen.get(track.id) ?? 0
    seen.set(track.id, occurrence + 1)
    return { track, index, key: `${track.id}#${occurrence}` }
  })

  return (
    <div className="track-list">
      <AnimatePresence initial>
        {items.map(({ track, index, key }) => (
          <Row
            key={key}
            track={track}
            index={index}
            active={index === activeIndex}
            collapseOnExit={collapseOnExit}
            onPlay={onPlay}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
