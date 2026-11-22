import { useEffect, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Track } from '../../../shared/types'
import { artistNames } from '../lib/cover'
import { closeShareDialog, useShareTrack } from '../store/share'
import { showToast } from '../store/toast'

function Dialog({ track }: { track: Track }): JSX.Element {
  const albumId = track.albums[0]?.id
  const trasheeLink = albumId
    ? `trashee://album/${albumId}/track/${track.id}`
    : `trashee://track/${track.id}`
  const webLink = albumId
    ? `https://music.yandex.ru/album/${albumId}/track/${track.id}`
    : `https://music.yandex.ru/track/${track.id}`

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeShareDialog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const copy = async (text: string, msg: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(msg)
      closeShareDialog()
    } catch {
      showToast('Не удалось скопировать')
    }
  }

  return (
    <motion.div
      className="update-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeShareDialog()
      }}
    >
      <motion.div
        className="update-card share-card"
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 4 }}
        transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
      >
        <div>
          <h2>Поделиться</h2>
          <p className="muted small picker-track">
            {track.title} — {artistNames(track)}
          </p>
        </div>

        <div className="share-link-box">
          <span className="muted small">Ссылка для trashee</span>
          <div className="share-link-row">
            <span className="share-link-text">{trasheeLink}</span>
            <button
              className="chip accent"
              onClick={() => void copy(trasheeLink, 'Ссылка trashee скопирована')}
            >
              Скопировать
            </button>
          </div>
        </div>

        <button
          className="share-alt-btn"
          onClick={() => void copy(webLink, 'Ссылка Яндекс Музыки скопирована')}
        >
          Или же для обычной яндекс музыки
        </button>

        <div className="update-actions">
          <button className="update-btn secondary" onClick={closeShareDialog}>
            Закрыть
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** "Share" modal window with trashee:// link and fallback to Yandex Music. */
export default function ShareDialog(): JSX.Element {
  const track = useShareTrack()
  return <AnimatePresence>{track && <Dialog key={track.id} track={track} />}</AnimatePresence>
}
