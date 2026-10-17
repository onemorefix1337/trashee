import { useEffect, useState, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { PlaylistInfo, Track } from '../../../shared/types'
import { trackWord } from '../lib/cover'
import { useIsPinned } from '../store/library'
import { openCollection } from '../store/nav'
import { currentTrack, playTracks, usePlayer } from '../store/player'
import CoverCard from './CoverCard'
import { PlayIcon, PlaylistIcon } from './Icons'
import Skeleton from './Skeleton'
import TrackList from './TrackList'

type Tab = 'tracks' | 'playlists'

const TABS: { id: Tab; label: string }[] = [
  { id: 'tracks', label: 'Мне нравится' },
  { id: 'playlists', label: 'Плейлисты' }
]

function LikedTracks(): JSX.Element {
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playingId = usePlayer((s) => currentTrack(s)?.id)

  useEffect(() => {
    let stale = false
    window.api
      .liked()
      .then((liked) => !stale && setTracks(liked))
      .catch(() => !stale && setError('Не удалось загрузить любимые треки'))
    return () => {
      stale = true
    }
  }, [])

  return (
    <>
      {tracks && tracks.length > 0 && (
        <motion.button
          className="chip play-all"
          onClick={() => playTracks(tracks, 0)}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.07 }}
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        >
          <PlayIcon size={14} /> Играть
        </motion.button>
      )}
      {error && <p className="error">{error}</p>}
      {!tracks && !error && <Skeleton rows={9} />}
      {tracks && tracks.length === 0 && (
        <p className="muted">Пока ничего нет. Лайкай треки, и они появятся здесь.</p>
      )}
      {tracks && tracks.length > 0 && (
        <TrackList
          tracks={tracks}
          onPlay={(i) => playTracks(tracks, i)}
          activeIndex={tracks.findIndex((t) => t.id === playingId)}
        />
      )}
    </>
  )
}

function PlaylistCard({ playlist, index }: { playlist: PlaylistInfo; index: number }): JSX.Element {
  const pinned = useIsPinned(playlist.ref)
  const subtitle = [playlist.mine ? 'Ваш плейлист' : playlist.owner, trackWord(playlist.trackCount)]
    .filter(Boolean)
    .join(' · ')

  return (
    <CoverCard
      coverUri={playlist.coverUri}
      title={playlist.title}
      subtitle={subtitle}
      index={index}
      pinned={pinned}
      fallback={<PlaylistIcon size={36} />}
      onClick={() => openCollection(playlist.ref)}
    />
  )
}

function Playlists(): JSX.Element {
  const [playlists, setPlaylists] = useState<PlaylistInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    window.api
      .playlists()
      .then((list) => !stale && setPlaylists(list))
      .catch(() => !stale && setError('Не удалось загрузить плейлисты'))
    return () => {
      stale = true
    }
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!playlists) return <Skeleton rows={6} />
  if (playlists.length === 0) return <p className="muted">Плейлистов пока нет</p>

  const mine = playlists.filter((playlist) => playlist.mine)
  const saved = playlists.filter((playlist) => !playlist.mine)

  return (
    <>
      {mine.length > 0 && (
        <section>
          <h3 className="section-title">Мои плейлисты</h3>
          <div className="grid">
            {mine.map((playlist, i) => (
              <PlaylistCard key={playlist.key} playlist={playlist} index={i} />
            ))}
          </div>
        </section>
      )}
      {saved.length > 0 && (
        <section>
          <h3 className="section-title">Сохранённые</h3>
          <div className="grid">
            {saved.map((playlist, i) => (
              <PlaylistCard key={playlist.key} playlist={playlist} index={i + mine.length} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

export default function LibraryPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>('tracks')

  return (
    <div className="page">
      <div className="page-head">
        <motion.h2
          className="page-title"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
        >
          Коллекция
        </motion.h2>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            {tab === id && (
              <motion.span
                layoutId="tab-pill"
                className="tab-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'tracks' ? <LikedTracks /> : <Playlists />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
