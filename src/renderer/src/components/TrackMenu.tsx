import { useEffect, useRef, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Track } from '../../../shared/types'
import { artistNames } from '../lib/cover'
import { openCollection, openSimilar } from '../store/nav'
import { enqueueNext } from '../store/player'

export interface MenuPoint {
  x: number
  y: number
}

const WIDTH = 252
const ITEM_HEIGHT = 40
const EDGE = 8

interface Item {
  label: string
  run: () => void
}

function itemsFor(track: Track): Item[] {
  const album = track.albums.find((candidate) => candidate.id)
  const items: Item[] = [{ label: 'Играть дальше', run: () => enqueueNext([track]) }]
  if (album) {
    items.push({
      label: `Альбом: ${album.title}`,
      run: () => openCollection({ type: 'album', id: album.id })
    })
  }
  for (const artist of track.artists.filter((candidate) => candidate.id)) {
    items.push({
      label: `Исполнитель: ${artist.name}`,
      run: () => openCollection({ type: 'artist', id: artist.id })
    })
  }
  items.push({
    label: 'Похожие треки',
    run: () =>
      openSimilar({
        id: track.id,
        title: track.title,
        artist: artistNames(track),
        coverUri: track.coverUri
      })
  })
  return items
}

function Menu({
  track,
  point,
  onClose
}: {
  track: Track
  point: MenuPoint
  onClose: () => void
}): JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const items = itemsFor(track)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    // The menu is anchored to a spot in the window, so anything that moves the page closes it.
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const height = items.length * ITEM_HEIGHT + 12
  const left = Math.max(EDGE, Math.min(point.x, window.innerWidth - WIDTH - EDGE))
  const top = Math.max(EDGE, Math.min(point.y, window.innerHeight - height - EDGE))

  return (
    <motion.div
      ref={root}
      className="ctx-menu"
      role="menu"
      style={{ left, top }}
      initial={{ opacity: 0, scale: 0.92, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 460, damping: 30 }}
      // The menu is rendered in a portal, but React events still bubble to the row that owns it.
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className="menu-item"
          role="menuitem"
          onClick={() => {
            onClose()
            item.run()
          }}
        >
          {item.label}
        </button>
      ))}
    </motion.div>
  )
}

/** Context menu of a track: play next, open its album or artist, find similar tracks. */
export default function TrackMenu({
  track,
  point,
  onClose
}: {
  track: Track
  point: MenuPoint | null
  onClose: () => void
}): JSX.Element {
  return createPortal(
    <AnimatePresence>
      {point && <Menu key="menu" track={track} point={point} onClose={onClose} />}
    </AnimatePresence>,
    document.body
  ) as JSX.Element
}
