import { useEffect, useState, type FormEvent, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { PlaylistInfo, Track } from '../../../shared/types'
import { artistNames, coverUrl } from '../lib/cover'
import { closePlaylistPicker, usePickerTrack } from '../store/picker'
import { showToast } from '../store/toast'

const TITLE_LIMIT = 100

type Loaded =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; own: PlaylistInfo[] }

const kindOf = (info: PlaylistInfo): number | null =>
  info.ref.type === 'playlist' && info.ref.kind !== undefined ? info.ref.kind : null

function Picker({ track }: { track: Track }): JSX.Element {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let stale = false
    window.api
      .playlists()
      .then((all) => {
        if (!stale)
          setLoaded({
            status: 'ready',
            own: all.filter((info) => info.mine && kindOf(info) !== null)
          })
      })
      .catch(() => !stale && setLoaded({ status: 'failed' }))
    return () => {
      stale = true
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closePlaylistPicker()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const addTo = async (info: PlaylistInfo): Promise<void> => {
    const kind = kindOf(info)
    if (kind === null || busy) return
    setBusy(true)
    try {
      const outcome = await window.api.addToPlaylist(kind, track.id, track.albums[0]?.id)
      showToast(
        outcome === 'exists' ? `Трек уже есть в «${info.title}»` : `Добавлено в «${info.title}»`
      )
      closePlaylistPicker()
    } catch {
      showToast(`Не удалось добавить в «${info.title}»`)
      setBusy(false)
    }
  }

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const name = title.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const info = await window.api.createPlaylist(name)
      const kind = kindOf(info)
      if (kind !== null) await window.api.addToPlaylist(kind, track.id, track.albums[0]?.id)
      showToast(`Плейлист «${info.title}» создан, трек добавлен`)
      closePlaylistPicker()
    } catch {
      showToast('Не удалось создать плейлист')
      setBusy(false)
    }
  }

  return (
    <motion.div
      className="update-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={(event) => event.target === event.currentTarget && closePlaylistPicker()}
    >
      <motion.div
        className="update-card picker-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        <div>
          <h2 id="picker-title">В плейлист</h2>
          <p className="muted small picker-track">
            {track.title} — {artistNames(track)}
          </p>
        </div>

        <form className="picker-new" onSubmit={(event) => void create(event)}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={TITLE_LIMIT}
            placeholder="Новый плейлист"
            aria-label="Название нового плейлиста"
            disabled={busy}
          />
          <button className="chip accent" type="submit" disabled={busy || !title.trim()}>
            Создать
          </button>
        </form>

        <div className="picker-list" role="list">
          {loaded.status === 'loading' && <p className="muted small">Загружаем плейлисты…</p>}
          {loaded.status === 'failed' && (
            <p className="error small">Не удалось загрузить плейлисты</p>
          )}
          {loaded.status === 'ready' && loaded.own.length === 0 && (
            <p className="muted small">Своих плейлистов пока нет, создай первый выше.</p>
          )}
          {loaded.status === 'ready' &&
            loaded.own.map((info) => {
              const cover = coverUrl(info, '100x100')
              return (
                <button
                  key={info.key}
                  className="picker-row"
                  role="listitem"
                  onClick={() => void addTo(info)}
                  disabled={busy}
                >
                  <span className="thumb">{cover && <img src={cover} alt="" />}</span>
                  <span className="picker-name">
                    <span>{info.title}</span>
                    <span className="muted small">{info.trackCount} треков</span>
                  </span>
                </button>
              )
            })}
        </div>

        <div className="update-actions">
          <button className="update-btn secondary" onClick={closePlaylistPicker}>
            Отмена
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** "Add to playlist" window over the whole app: pick one of your playlists or make a new one. */
export default function PlaylistPicker(): JSX.Element {
  const track = usePickerTrack()
  return <AnimatePresence>{track && <Picker key={track.id} track={track} />}</AnimatePresence>
}
