import { useEffect, useRef, useState, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { SLEEP_MINUTES, formatRemaining } from '../../../shared/sleep'
import { cancelSleep, sleepAfterTrack, startSleepTimer, useSleep } from '../store/sleep'
import { MoonIcon } from './Icons'

/** The sleep timer: pick a time (or "until the track ends") and the music fades out and stops. */
export default function SleepButton(): JSX.Element {
  const sleep = useSleep()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (action: () => void): void => {
    action()
    setOpen(false)
  }
  const active = sleep.mode !== 'off'
  const label =
    sleep.mode === 'timer'
      ? formatRemaining(sleep.remainingMs)
      : sleep.mode === 'track'
        ? 'до конца трека'
        : null

  return (
    <div ref={root} className="sleep">
      <motion.button
        className={`chip${active ? ' accent' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Таймер сна"
        aria-expanded={open}
        title="Таймер сна: музыка плавно затихнет и остановится"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.93 }}
      >
        <MoonIcon size={16} />
        {label}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="sleep-menu"
            role="menu"
            initial={{ opacity: 0, scale: 0.92, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 460, damping: 30 }}
          >
            {SLEEP_MINUTES.map((minutes) => (
              <button
                key={minutes}
                className="menu-item"
                role="menuitem"
                onClick={() => choose(() => startSleepTimer(minutes))}
              >
                Через {minutes} мин
              </button>
            ))}
            <button className="menu-item" role="menuitem" onClick={() => choose(sleepAfterTrack)}>
              После этого трека
            </button>
            {active && (
              <button
                className="menu-item danger"
                role="menuitem"
                onClick={() => choose(cancelSleep)}
              >
                Выключить таймер
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
