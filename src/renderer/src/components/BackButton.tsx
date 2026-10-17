import type { JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { back, useCanGoBack } from '../store/nav'
import { ChevronIcon } from './Icons'

/** Sits in the title bar and walks back through the pages that were opened. */
export default function BackButton(): JSX.Element {
  const visible = useCanGoBack()
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          className="back-btn"
          onClick={back}
          aria-label="Назад"
          title="Назад (Alt+←)"
          initial={{ opacity: 0, x: -10, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -10, scale: 0.8 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.88, x: -3 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        >
          <ChevronIcon size={20} />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
