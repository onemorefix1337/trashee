import type { JSX } from 'react'
import { motion } from 'motion/react'
import Logo from './Logo'

interface Props {
  onRetry: () => void
  onLoginAgain: () => void
}

/** Shown when a saved login exists but Yandex cannot be reached; nothing has to be typed in again. */
export default function Offline({ onRetry, onLoginAgain }: Props): JSX.Element {
  return (
    <div className="login">
      <div className="login-orb" aria-hidden="true" />
      <Logo size={72} />
      <h1 className="wordmark">trashee</h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Не получается связаться с Яндекс Музыкой
      </motion.p>
      <motion.p
        className="muted small"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        Вход сохранён, заново вводить код не нужно. Проверь сеть или VPN и повтори.
      </motion.p>
      <motion.button
        className="primary"
        onClick={onRetry}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 220, damping: 18 }}
      >
        Повторить
      </motion.button>
      <button className="ghost" onClick={onLoginAgain}>
        Войти заново
      </button>
    </div>
  )
}
