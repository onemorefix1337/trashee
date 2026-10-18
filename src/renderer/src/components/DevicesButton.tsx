import { useEffect, useRef, useState, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { controlDevice, handoffTo, pullFrom, useSync } from '../store/sync'
import { currentTrack, usePlayer } from '../store/player'
import { DevicesIcon } from './Icons'

/** Phones paired with this computer: take over what one plays, hand over what plays here, or press its buttons. */
export default function DevicesButton(): JSX.Element | null {
  const sync = useSync()
  const playingHere = usePlayer((state) => currentTrack(state) !== undefined)
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

  if (!sync.enabled || sync.devices.length === 0) return null
  const online = sync.devices.filter((device) => device.online).length

  return (
    <div ref={root} className="devices">
      <motion.button
        className={`chip${online > 0 ? '' : ' muted'}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Устройства"
        aria-expanded={open}
        title="Телефоны: передать музыку и управлять ими"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.93 }}
      >
        <DevicesIcon size={16} />
        {online > 0 ? online : null}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="devices-menu"
            role="menu"
            initial={{ opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 460, damping: 30 }}
          >
            {sync.devices.map((device) => {
              const track = device.state?.track
              return (
                <div key={device.id} className="device">
                  <div className="device-head">
                    <span className={`dot${device.online ? ' on' : ''}`} aria-hidden="true" />
                    <strong>{device.name}</strong>
                    <span className="muted small">{device.online ? 'в сети' : 'не в сети'}</span>
                  </div>
                  {track && device.online && (
                    <div className="device-track">
                      <span>{track.title}</span>
                      <span className="muted small">
                        {track.artist} · {device.state?.playing ? 'играет' : 'на паузе'}
                      </span>
                    </div>
                  )}
                  {device.online && (
                    <div className="device-actions">
                      {track && (
                        <>
                          <button
                            className="chip"
                            aria-label="Предыдущий на устройстве"
                            onClick={() => void controlDevice(device.id, { cmd: 'prev' })}
                          >
                            ⏮
                          </button>
                          <button
                            className="chip"
                            aria-label="Пауза или игра на устройстве"
                            onClick={() => void controlDevice(device.id, { cmd: 'toggle' })}
                          >
                            ⏯
                          </button>
                          <button
                            className="chip"
                            aria-label="Следующий на устройстве"
                            onClick={() => void controlDevice(device.id, { cmd: 'next' })}
                          >
                            ⏭
                          </button>
                          <button
                            className="chip accent"
                            onClick={() => {
                              setOpen(false)
                              void pullFrom(device.id)
                            }}
                          >
                            Забрать сюда
                          </button>
                        </>
                      )}
                      {playingHere && (
                        <button
                          className="chip"
                          onClick={() => {
                            setOpen(false)
                            void handoffTo(device.id, device.name)
                          }}
                        >
                          Передать на {device.name}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
