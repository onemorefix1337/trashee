import { useEffect, useRef, useState, type JSX } from 'react'
import { motion } from 'motion/react'
import { LYRIC_LEAD_SECONDS, activeLine } from '../../../shared/lrc'
import type { Lyrics, Track } from '../../../shared/types'
import { cachedLyrics, loadLyrics } from '../lib/lyrics'
import { seek, usePlayer } from '../store/player'

const USER_SCROLL_PAUSE_MS = 3500

interface Load {
  id: string
  lyrics: Lyrics | null
  failed: boolean
}

const opacityFor = (distance: number): number =>
  distance === 0 ? 1 : distance === 1 ? 0.6 : distance === 2 ? 0.42 : 0.3

/** Lyrics of the current track: synced lines follow the song and can be clicked to seek, plain text just scrolls. */
export default function LyricsPanel({ track }: { track: Track }): JSX.Element {
  const [load, setLoad] = useState<Load | null>(null)
  const [attempt, setAttempt] = useState(0)
  const position = usePlayer((s) => s.position)
  const box = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLElement | null)[]>([])
  const pausedUntil = useRef(0)

  useEffect(() => {
    if (cachedLyrics(track.id)) return
    let stale = false
    loadLyrics(track)
      .then((lyrics) => !stale && setLoad({ id: track.id, lyrics, failed: false }))
      .catch(() => !stale && setLoad({ id: track.id, lyrics: null, failed: true }))
    return () => {
      stale = true
    }
  }, [track, attempt])

  const own = load?.id === track.id ? load : null
  const lyrics = cachedLyrics(track.id) ?? own?.lyrics ?? null
  const failed = own?.failed === true
  const lines = lyrics?.synced ?? null
  const active = lines ? activeLine(lines, position + LYRIC_LEAD_SECONDS) : -1

  useEffect(() => {
    box.current?.scrollTo({ top: 0 })
    pausedUntil.current = 0
  }, [track.id])

  useEffect(() => {
    const container = box.current
    const line = lineRefs.current[active]
    if (!container || !line || active < 0 || Date.now() < pausedUntil.current) return
    container.scrollTo({
      top: line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2,
      behavior: 'smooth'
    })
  }, [active])

  const pauseFollowing = (): void => {
    pausedUntil.current = Date.now() + USER_SCROLL_PAUSE_MS
  }

  let body: JSX.Element
  if (failed) {
    body = (
      <div className="lyrics-note">
        <p className="muted">Не удалось загрузить текст</p>
        <button
          className="chip"
          onClick={() => {
            setLoad(null)
            setAttempt((n) => n + 1)
          }}
        >
          Повторить
        </button>
      </div>
    )
  } else if (!lyrics) {
    body = (
      <div className="lyrics-loading" aria-hidden="true">
        {[62, 80, 48, 70, 56].map((width, i) => (
          <div key={i} className="bar shimmer" style={{ width: `${width}%` }} />
        ))}
      </div>
    )
  } else if (lines) {
    body = (
      <>
        {lines.map((line, i) => (
          <motion.p
            key={i}
            ref={(element) => {
              lineRefs.current[i] = element
            }}
            className={`lyric-line${i === active ? ' active' : ''}${line.text ? '' : ' gap'}`}
            animate={{
              opacity: active < 0 ? 0.45 : opacityFor(Math.abs(i - active)),
              scale: i === active ? 1.03 : 1
            }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={() => seek(line.time)}
          >
            {line.text || '♪'}
          </motion.p>
        ))}
      </>
    )
  } else if (lyrics.text) {
    body = <p className="lyrics-plain">{lyrics.text}</p>
  } else {
    body = (
      <div className="lyrics-note">
        <p className="muted">
          {lyrics.instrumental ? 'Инструментальный трек, слов нет' : 'Для этого трека текста нет'}
        </p>
      </div>
    )
  }
  const hasText = lyrics !== null && (lines !== null || !!lyrics.text)

  return (
    <div
      ref={box}
      className={`lyrics${lines ? ' synced' : ''}`}
      onWheel={pauseFollowing}
      onTouchMove={pauseFollowing}
    >
      {body}
      {hasText && lyrics?.source && (
        <p className="lyrics-source">
          Источник:{' '}
          {lyrics.source.url ? (
            <a href={lyrics.source.url} target="_blank" rel="noreferrer">
              {lyrics.source.name}
            </a>
          ) : (
            lyrics.source.name
          )}
          {lines ? ' · с синхронизацией' : ' · без синхронизации'}
        </p>
      )}
    </div>
  )
}
