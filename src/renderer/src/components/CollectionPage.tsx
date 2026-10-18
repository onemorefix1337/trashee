import { Fragment, useEffect, useState, type JSX, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { AlbumInfo, Collection, CollectionRef } from '../../../shared/types'
import { coverUrl, trackWord } from '../lib/cover'
import { setPinned, useIsPinned } from '../store/library'
import { openCollection } from '../store/nav'
import { currentTrack, playTracks, usePlayer } from '../store/player'
import ArtistLinks from './ArtistLinks'
import CoverCard from './CoverCard'
import { PinIcon, PlayIcon, PlaylistIcon, ShuffleIcon } from './Icons'
import SaveOfflineButton from './SaveOfflineButton'
import Skeleton from './Skeleton'
import TrackList from './TrackList'

const TOP_TRACKS = 10

const KIND_LABEL: Record<string, string> = {
  single: 'Сингл',
  compilation: 'Сборник',
  podcast: 'Подкаст'
}

/** "2021 · Сингл" for a release on an artist page. */
function releaseLine(album: AlbumInfo): string {
  const kind = album.kind ? KIND_LABEL[album.kind] : undefined
  return [album.year, kind ?? 'Альбом'].filter(Boolean).join(' · ')
}

/** The line under the title: who made it (as links where possible) and how many tracks. */
function meta(data: Collection): ReactNode[] {
  const parts: ReactNode[] = []
  if (data.artists.length > 0) parts.push(<ArtistLinks artists={data.artists} />)
  else if (data.subtitle) parts.push(data.subtitle)
  parts.push(trackWord(data.trackCount))
  return parts
}

const TYPE_LABEL = { playlist: 'Плейлист', album: 'Альбом', artist: 'Исполнитель' } as const

/** Playlist, album or artist: header with actions and the list of tracks. */
export default function CollectionPage({
  collectionRef
}: {
  collectionRef: CollectionRef
}): JSX.Element {
  const [loaded, setLoaded] = useState<{ ref: CollectionRef; data: Collection } | null>(null)
  const [failed, setFailed] = useState(false)
  const [pinError, setPinError] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const playingId = usePlayer((s) => currentTrack(s)?.id)
  // A playlist without uid/kind (generated ones) cannot be pinned through the API.
  const pinnable =
    collectionRef.type !== 'playlist' ||
    (collectionRef.uid !== undefined && collectionRef.kind !== undefined)
  const pinned = useIsPinned(collectionRef)

  useEffect(() => {
    let stale = false
    window.api
      .collection(collectionRef)
      .then((data) => !stale && setLoaded({ ref: collectionRef, data }))
      .catch(() => !stale && setFailed(true))
    return () => {
      stale = true
    }
  }, [collectionRef])

  const data = loaded?.ref === collectionRef ? loaded.data : null
  const cover = coverUrl(data ?? undefined, '300x300')

  // An artist has far more tracks than fit before the albums; show the top ones and let the rest wait.
  const shownTracks = (collection: Collection): Collection['tracks'] =>
    collectionRef.type === 'artist' && !showAll
      ? collection.tracks.slice(0, TOP_TRACKS)
      : collection.tracks

  const togglePin = (): void => {
    if (!data) return
    setPinError(false)
    setPinned(collectionRef, !pinned, { title: data.title, coverUri: data.coverUri }).catch(() =>
      setPinError(true)
    )
  }

  return (
    <div className="page">
      <header className="collection-head">
        <motion.div
          className={`collection-cover${collectionRef.type === 'artist' ? ' round' : ''}`}
          initial={{ opacity: 0, scale: 0.85, rotate: -3 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
        >
          {cover && <img src={cover} alt="" />}
        </motion.div>

        <div className="collection-info">
          <motion.div
            className="badge"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            {TYPE_LABEL[collectionRef.type]}
          </motion.div>
          <motion.h2
            className="collection-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            {data?.title ?? (failed ? 'Не открылось' : '')}
          </motion.h2>
          {data && (
            <motion.div
              className="muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {meta(data).map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && ' · '}
                  {part}
                </Fragment>
              ))}
            </motion.div>
          )}

          {data && data.tracks.length > 0 && (
            <motion.div
              className="collection-actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <motion.button
                className="primary-pill"
                onClick={() => playTracks(data.tracks, 0)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
              >
                <PlayIcon size={16} /> Играть
              </motion.button>
              <motion.button
                className="chip"
                onClick={() => playTracks(shuffled(data.tracks), 0)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
              >
                <ShuffleIcon size={16} /> Вперемешку
              </motion.button>
              <SaveOfflineButton target={collectionRef} title={data.title} />
              {pinnable && (
                <motion.button
                  className={`chip${pinned ? ' on' : ''}`}
                  onClick={togglePin}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.94 }}
                >
                  <PinIcon size={16} filled={pinned} /> {pinned ? 'Закреплено' : 'Закрепить'}
                </motion.button>
              )}
            </motion.div>
          )}
          <AnimatePresence>
            {pinError && (
              <motion.p
                className="error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                Не удалось поменять закрепление
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </header>

      {failed && <p className="error">Не удалось загрузить. Проверь сеть и попробуй ещё раз.</p>}
      {!data && !failed && <Skeleton rows={8} />}
      {data && data.tracks.length === 0 && <p className="muted">Здесь пока нет треков</p>}
      {data && data.tracks.length > 0 && (
        <>
          {collectionRef.type === 'artist' && <h3 className="section-title">Популярные треки</h3>}
          <TrackList
            tracks={shownTracks(data)}
            onPlay={(i) => playTracks(data.tracks, i)}
            activeIndex={shownTracks(data).findIndex((t) => t.id === playingId)}
          />
          {collectionRef.type === 'artist' && data.tracks.length > TOP_TRACKS && (
            <motion.button
              className="chip show-all"
              onClick={() => setShowAll((value) => !value)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.94 }}
            >
              {showAll ? 'Свернуть' : `Показать все (${data.tracks.length})`}
            </motion.button>
          )}
        </>
      )}
      {data && data.albums.length > 0 && (
        <section className="releases">
          <h3 className="section-title">Альбомы</h3>
          <div className="grid">
            {data.albums.map((album, i) => (
              <CoverCard
                key={album.id}
                coverUri={album.coverUri}
                title={album.title}
                subtitle={releaseLine(album)}
                index={i}
                fallback={<PlaylistIcon size={36} />}
                onClick={() => openCollection({ type: 'album', id: album.id })}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
