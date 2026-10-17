import { useEffect, useState, type JSX } from 'react'
import { motion } from 'motion/react'
import type { Track } from '../../../shared/types'
import { coverUrl, trackWord } from '../lib/cover'
import type { SimilarSeed } from '../store/nav'
import { currentTrack, enqueueNext, playTracks, usePlayer } from '../store/player'
import { PlayIcon } from './Icons'
import Skeleton from './Skeleton'
import TrackList from './TrackList'

/** Tracks similar to one the user was listening to. Opening it changes nothing in the queue until they choose. */
export default function SimilarPage({ seed }: { seed: SimilarSeed }): JSX.Element {
  const [loaded, setLoaded] = useState<{ id: string; tracks: Track[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const playingId = usePlayer((s) => currentTrack(s)?.id)

  useEffect(() => {
    let stale = false
    window.api
      .similar(seed.id)
      .then(
        (tracks) => !stale && setLoaded({ id: seed.id, tracks: tracks.filter((t) => t.available) })
      )
      .catch(() => !stale && setFailed(true))
    return () => {
      stale = true
    }
  }, [seed.id])

  const tracks = loaded?.id === seed.id ? loaded.tracks : null
  const cover = coverUrl(seed, '300x300')

  return (
    <div className="page">
      <header className="collection-head">
        <motion.div
          className="collection-cover"
          initial={{ opacity: 0, scale: 0.85, rotate: -3 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        >
          {cover && <img src={cover} alt="" />}
        </motion.div>

        <div className="collection-info">
          <div className="badge">Похожие</div>
          <motion.h2
            className="collection-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {`На «${seed.title}»`}
          </motion.h2>
          <div className="muted">
            {[seed.artist, tracks ? trackWord(tracks.length) : ''].filter(Boolean).join(' · ')}
          </div>

          {tracks && tracks.length > 0 && (
            <motion.div
              className="collection-actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <motion.button
                className="primary-pill"
                onClick={() => playTracks(tracks, 0)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
              >
                <PlayIcon size={16} /> Играть
              </motion.button>
              <motion.button
                className="chip"
                onClick={() => enqueueNext(tracks)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
              >
                Следующими
              </motion.button>
            </motion.div>
          )}
        </div>
      </header>

      {failed && (
        <p className="error">Не удалось найти похожие треки. Проверь сеть и попробуй ещё раз.</p>
      )}
      {!tracks && !failed && <Skeleton rows={8} />}
      {tracks && tracks.length === 0 && <p className="muted">Похожих треков не нашлось</p>}
      {tracks && tracks.length > 0 && (
        <TrackList
          tracks={tracks}
          onPlay={(i) => playTracks(tracks, i)}
          activeIndex={tracks.findIndex((t) => t.id === playingId)}
        />
      )}
    </div>
  )
}
