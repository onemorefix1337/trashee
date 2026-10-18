import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Track } from '../../../shared/types'
import { parseYandexLink } from '../../../shared/yandex-link'
import { openYandexLink } from '../store/links'
import { currentTrack, playTracks, usePlayer } from '../store/player'
import { showToast } from '../store/toast'
import { SearchIcon } from './Icons'
import Skeleton from './Skeleton'
import TrackList from './TrackList'

const DEBOUNCE_MS = 350
const LINK_DELAY_MS = 200

interface Outcome {
  query: string
  tracks: Track[] | null
}

export default function SearchPage({ focusSignal }: { focusSignal: number }): JSX.Element {
  const [text, setText] = useState('')
  // The last finished search; tracks === null means it failed.
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const playingId = usePlayer((s) => currentTrack(s)?.id)
  const query = text.trim()
  const link = useMemo(() => parseYandexLink(query), [query])

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [focusSignal])

  // A pasted Yandex Music link is opened instead of searched for.
  useEffect(() => {
    if (!link) return
    const timer = setTimeout(() => {
      setText('')
      openYandexLink(link).catch(() => showToast('Не удалось открыть ссылку'))
    }, LINK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [link])

  useEffect(() => {
    if (!query || link) return
    let stale = false
    const timer = setTimeout(() => {
      window.api
        .search(query)
        .then((tracks) => !stale && setOutcome({ query, tracks }))
        .catch(() => !stale && setOutcome({ query, tracks: null }))
    }, DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query, link])

  const settled = outcome?.query === query
  const tracks = outcome?.tracks ?? []
  const loading = query !== '' && !settled && !link

  return (
    <div className="page">
      <motion.label
        className="search-box"
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        <motion.span
          className="search-icon"
          animate={
            loading ? { rotate: [0, 12, -12, 0], scale: [1, 1.15, 1] } : { rotate: 0, scale: 1 }
          }
          transition={loading ? { repeat: Infinity, duration: 1.1 } : undefined}
        >
          <SearchIcon size={18} />
        </motion.span>
        <input
          ref={input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Треки, исполнители или ссылка на Яндекс Музыку"
          spellCheck={false}
        />
        <AnimatePresence>
          {text && (
            <motion.button
              type="button"
              className="clear"
              aria-label="Очистить"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.4 }}
              whileHover={{ scale: 1.2, rotate: 90 }}
              whileTap={{ scale: 0.8 }}
              onClick={() => {
                setText('')
                input.current?.focus()
              }}
            >
              ×
            </motion.button>
          )}
        </AnimatePresence>
      </motion.label>

      <AnimatePresence mode="wait" initial={false}>
        {!query && (
          <motion.div
            key="idle"
            className="search-idle"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <span className="float">
              <SearchIcon size={44} />
            </span>
            <p className="muted">Начни вводить название, результаты появятся сами</p>
          </motion.div>
        )}
        {query && loading && tracks.length === 0 && (
          <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <Skeleton rows={7} />
          </motion.div>
        )}
        {query && settled && outcome.tracks === null && (
          <motion.p
            key="failed"
            className="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Поиск не сработал, попробуй ещё раз
          </motion.p>
        )}
        {query && settled && outcome.tracks?.length === 0 && (
          <motion.p key="empty" className="muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            Ничего не нашлось
          </motion.p>
        )}
        {query && tracks.length > 0 && (
          <motion.div
            key="results"
            animate={{ opacity: loading ? 0.45 : 1 }}
            transition={{ duration: 0.2 }}
          >
            <TrackList
              tracks={tracks}
              onPlay={(i) => playTracks(tracks, i)}
              activeIndex={tracks.findIndex((t) => t.id === playingId)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
