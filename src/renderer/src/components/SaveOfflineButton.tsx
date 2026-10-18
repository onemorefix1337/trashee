import { useEffect, useState, type JSX } from 'react'
import { motion } from 'motion/react'
import type { CollectionRef } from '../../../shared/types'
import { keyOf, removeOffline, saveOffline, useOfflineProgress } from '../store/offline'
import { CheckIcon, DownloadIcon } from './Icons'

const CONFIRM_MS = 3000

/** "Save for offline": tracks, lyrics and covers of a collection are kept in the app. Press again to remove. */
export default function SaveOfflineButton({
  target,
  title
}: {
  target: 'liked' | CollectionRef
  title: string
}): JSX.Element {
  const key = keyOf(target)
  const progress = useOfflineProgress(key)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirming])

  const saving = progress?.status === 'saving'
  const saved = progress?.status === 'saved'

  const onClick = (): void => {
    if (saving) {
      void window.api.cancelOffline(key)
    } else if (saved) {
      if (confirming) {
        setConfirming(false)
        removeOffline(key, title)
      } else {
        setConfirming(true)
      }
    } else {
      saveOffline(target, title)
    }
  }

  const label = saving
    ? `Сохраняем ${progress.done} из ${progress.total || '…'}`
    : saved
      ? confirming
        ? 'Убрать?'
        : 'Сохранено'
      : 'Сохранить офлайн'

  return (
    <motion.button
      className={`chip${saved && !confirming ? ' on' : ''}${confirming ? ' danger' : ''}`}
      onClick={onClick}
      title={saving ? 'Нажми, чтобы отменить' : saved ? 'Нажми дважды, чтобы убрать' : undefined}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.94 }}
    >
      {saved ? <CheckIcon size={16} /> : <DownloadIcon size={16} />} {label}
    </motion.button>
  )
}
