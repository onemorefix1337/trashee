import type { JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { dismissToast, useToast } from '../store/toast'

/** Bottom-centre notice with an optional action; sits above the mini player. */
export default function ToastHost(): JSX.Element {
  const toast = useToast()
  return (
    <div className="toast-host" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <span className="toast-text">{toast.text}</span>
            {toast.action && (
              <motion.button
                className="toast-action"
                onClick={toast.action.run}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
              >
                {toast.action.label}
              </motion.button>
            )}
            <button className="toast-close" onClick={dismissToast} aria-label="Закрыть">
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
