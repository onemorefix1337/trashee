import { useRef, useState, type JSX, type MouseEvent } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'motion/react'
import type { Track } from '../../../shared/types'
import { artistNames, coverUrl, formatTime } from '../lib/cover'
import { openCollection, openSimilar } from '../store/nav'
import {
  currentTrack,
  cycleRepeat,
  dislikeCurrent,
  jumpTo,
  next,
  previous,
  seek,
  setVolume,
  startWave,
  toggle,
  toggleShuffle,
  usePlayer
} from '../store/player'
import {
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SimilarIcon,
  ThumbDownIcon,
  VolumeIcon,
  WaveIcon
} from './Icons'
import ArtistLinks from './ArtistLinks'
import LikeButton from './LikeButton'
import LyricsPanel from './LyricsPanel'
import SeekBar from './SeekBar'
import Segmented from './Segmented'
import TrackList from './TrackList'

const TILT_DEGREES = 14
const TILT_SPRING = { stiffness: 140, damping: 14 }

type Panel = 'queue' | 'lyrics'

const PANEL_OPTIONS: { value: Panel; label: string }[] = [
  { value: 'queue', label: 'Дальше' },
  { value: 'lyrics', label: 'Текст' }
]

/** Cover with 3D tilt following the pointer, a spring "breathing" with play/pause and a blur-in on track change. */
function Cover({ track, playing }: { track: Track; playing: boolean }): JSX.Element {
  const tiltX = useSpring(useMotionValue(0), TILT_SPRING)
  const tiltY = useSpring(useMotionValue(0), TILT_SPRING)
  const src = coverUrl(track, '600x600')

  const onMove = (event: MouseEvent<HTMLDivElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    tiltY.set(((event.clientX - box.left) / box.width - 0.5) * TILT_DEGREES)
    tiltX.set(-((event.clientY - box.top) / box.height - 0.5) * TILT_DEGREES)
  }
  const onLeave = (): void => {
    tiltX.set(0)
    tiltY.set(0)
  }

  return (
    <div className="cover-stage" onMouseMove={onMove} onMouseLeave={onLeave}>
      <motion.div
        className={`cover${playing ? ' live' : ''}`}
        style={{ rotateX: tiltX, rotateY: tiltY }}
        animate={{ scale: playing ? 1 : 0.9 }}
        transition={{ type: 'spring', stiffness: 170, damping: 17 }}
      >
        <AnimatePresence initial={false}>
          {src ? (
            <motion.img
              key={track.id}
              src={src}
              alt=""
              initial={{ opacity: 0, scale: 1.18, filter: 'blur(20px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.65, ease: [0.2, 0.8, 0.2, 1] }}
            />
          ) : (
            <div key="empty" className="cover-empty" />
          )}
        </AnimatePresence>
        <div className="cover-sheen" />
      </motion.div>
    </div>
  )
}

const iconButton = {
  whileHover: { scale: 1.14 },
  whileTap: { scale: 0.84 }
}

export default function PlayerPage(): JSX.Element {
  const [panel, setPanel] = useState<Panel>('queue')
  const queueSection = useRef<HTMLElement>(null)
  const scrollToLyrics = useRef(false)
  const track = usePlayer(currentTrack)
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const playing = usePlayer((s) => s.playing)
  const loading = usePlayer((s) => s.loading)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  const volume = usePlayer((s) => s.volume)
  const shuffle = usePlayer((s) => s.shuffle)
  const repeat = usePlayer((s) => s.repeat)
  const wave = usePlayer((s) => s.wave !== null)
  const error = usePlayer((s) => s.error)

  if (!track) {
    return (
      <div className="empty-player">
        <div className={`wave-hero${loading ? ' loading' : ''}`}>
          <span className="ring r1" />
          <span className="ring r2" />
          <span className="ring r3" />
          <motion.button
            className="wave-start"
            onClick={() => void startWave()}
            disabled={loading}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          >
            <WaveIcon size={28} />
            <span>{loading ? 'Запускаю…' : 'Моя волна'}</span>
          </motion.button>
        </div>
        <motion.p
          className="muted"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Бесконечное радио по твоим вкусам. Или найди трек через поиск.
        </motion.p>
        <AnimatePresence>
          {error && (
            <motion.p
              className="error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const upcoming = queue.slice(index + 1)
  const album = track.albums.find((candidate) => candidate.id)

  return (
    <div className="player-page">
      <section className="now">
        <Cover track={track} playing={playing} />

        <div className="controls-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={track.id}
              className="heading"
              initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
              transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
            >
              {wave && <span className="badge">Моя волна</span>}
              <h2 className="track-title">
                {track.title}
                {track.version && <span className="version"> {track.version}</span>}
              </h2>
              <div className="track-artist">
                <ArtistLinks artists={track.artists} />
              </div>
              {album && (
                <div className="track-album">
                  Альбом:{' '}
                  <button
                    className="link"
                    onClick={() => openCollection({ type: 'album', id: album.id })}
                  >
                    {album.title}
                    {album.year ? ` · ${album.year}` : ''}
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="seek">
            <span className="time">{formatTime(position)}</span>
            <SeekBar
              value={position}
              max={duration}
              step={0.5}
              smooth
              label="Перемотка"
              onChange={seek}
            />
            <span className="time">{formatTime(duration)}</span>
          </div>

          <div className="transport">
            <motion.button
              className={`icon-btn${shuffle ? ' on' : ''}`}
              onClick={toggleShuffle}
              aria-label="Перемешать"
              disabled={wave}
              {...iconButton}
            >
              <ShuffleIcon />
            </motion.button>
            <motion.button
              className="icon-btn"
              onClick={() => void previous()}
              aria-label="Предыдущий"
              whileHover={iconButton.whileHover}
              whileTap={{ scale: 0.84, x: -4 }}
            >
              <PrevIcon size={24} />
            </motion.button>
            <motion.button
              className={`play${playing ? ' live' : ''}`}
              onClick={toggle}
              aria-label={playing ? 'Пауза' : 'Играть'}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={playing || loading ? 'pause' : 'play'}
                  className="swap"
                  initial={{ scale: 0.3, opacity: 0, rotate: -70 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.3, opacity: 0, rotate: 70 }}
                  transition={{ duration: 0.16 }}
                >
                  {playing || loading ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <motion.button
              className="icon-btn"
              onClick={() => void next()}
              aria-label="Следующий"
              whileHover={iconButton.whileHover}
              whileTap={{ scale: 0.84, x: 4 }}
            >
              <NextIcon size={24} />
            </motion.button>
            <motion.button
              className={`icon-btn${repeat !== 'off' ? ' on' : ''}`}
              onClick={cycleRepeat}
              aria-label="Повтор"
              {...iconButton}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={repeat}
                  className="swap"
                  initial={{ scale: 0.5, opacity: 0, rotate: -90 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.5, opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.14 }}
                >
                  {repeat === 'one' ? <RepeatOneIcon /> : <RepeatIcon />}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          </div>

          <div className="extras">
            <LikeButton track={track} />
            <motion.button
              className="icon-btn"
              onClick={() => void dislikeCurrent()}
              aria-label="Не нравится"
              title="Не нравится: пропустить и больше не показывать (D)"
              {...iconButton}
            >
              <ThumbDownIcon size={20} />
            </motion.button>
            <motion.button
              className="chip"
              onClick={() =>
                openSimilar({
                  id: track.id,
                  title: track.title,
                  artist: artistNames(track),
                  coverUri: track.coverUri
                })
              }
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.93 }}
            >
              <SimilarIcon size={16} /> Похожие
            </motion.button>
            <label className="volume">
              <VolumeIcon size={18} />
              <SeekBar value={volume} max={1} label="Громкость" onChange={setVolume} />
            </label>
          </div>

          <AnimatePresence>
            {error && (
              <motion.p
                className="error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </section>

      <motion.section
        ref={queueSection}
        className="queue"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        <div className="panel-tabs">
          <Segmented
            label="Что показать"
            options={PANEL_OPTIONS}
            value={panel}
            onChange={(value) => {
              setPanel(value)
              // The lyrics sit below the cover; they are scrolled into view once the tab has swapped.
              scrollToLyrics.current = value === 'lyrics'
            }}
          />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={panel}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            onAnimationComplete={() => {
              if (!scrollToLyrics.current) return
              scrollToLyrics.current = false
              queueSection.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
            }}
          >
            {panel === 'lyrics' ? (
              <LyricsPanel track={track} />
            ) : upcoming.length === 0 ? (
              <p className="muted">Очередь пуста</p>
            ) : (
              <TrackList tracks={upcoming} collapseOnExit onPlay={(i) => jumpTo(index + 1 + i)} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.section>
    </div>
  )
}
