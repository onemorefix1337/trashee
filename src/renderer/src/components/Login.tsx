import { useEffect, useState, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Account, DeviceCode } from '../../../shared/types'
import { formatTime } from '../lib/cover'
import Logo from './Logo'

const WORDMARK = 'trashee'

export default function Login({ onDone }: { onDone: (account: Account) => void }): JSX.Element {
  const [code, setCode] = useState<DeviceCode | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)

  useEffect(
    () =>
      window.api.onLoginCode((next) => {
        setCode(next)
        setExpiresAt(Date.now() + next.expiresIn * 1000)
        setNow(Date.now())
      }),
    []
  )

  useEffect(() => {
    if (!code) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [code])

  const secondsLeft = Math.max(0, Math.round((expiresAt - now) / 1000))

  const copyCode = (): void => {
    if (!code) return
    void window.api.copy(code.userCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const login = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      onDone(await window.api.login())
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : ''
      setError(message || 'Не удалось войти')
      setCode(null)
      setBusy(false)
    }
  }

  const cancel = (): void => {
    void window.api.cancelLogin()
  }

  return (
    <div className="login">
      <div className="login-orb" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, scale: 0.5, rotate: -12 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 13 }}
      >
        <Logo size={92} animated />
      </motion.div>

      <h1 className="wordmark" aria-label={WORDMARK}>
        {WORDMARK.split('').map((letter, i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            initial={{ y: 50, opacity: 0, filter: 'blur(12px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            transition={{ delay: 0.06 * i, type: 'spring', stiffness: 130, damping: 13 }}
          >
            {letter}
          </motion.span>
        ))}
      </h1>
      <motion.p
        className="muted"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        Свой клиент Яндекс Музыки
      </motion.p>

      <AnimatePresence mode="wait">
        {code ? (
          <motion.div
            key="code"
            className="login-code"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          >
            <p className="muted">Мы открыли страницу Яндекса. Введи на ней код:</p>
            <div className="code" aria-label={code.userCode}>
              {code.userCode.split('').map((char, i) => (
                <motion.span
                  key={i}
                  aria-hidden="true"
                  initial={{ rotateX: -90, opacity: 0 }}
                  animate={{ rotateX: 0, opacity: 1 }}
                  transition={{
                    delay: 0.08 * i + 0.1,
                    type: 'spring',
                    stiffness: 160,
                    damping: 14
                  }}
                >
                  {char}
                </motion.span>
              ))}
            </div>
            <button className="chip" onClick={copyCode}>
              {copied ? 'Скопировано' : 'Скопировать код'}
            </button>
            <p className="muted small waiting">
              Ждём подтверждения
              <span className="dots" /> · код действует ещё {formatTime(secondsLeft)}
            </p>
            <p className="muted small">{code.verificationUrl}</p>
            <button className="ghost" onClick={cancel}>
              Отмена
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="login"
            className="primary"
            onClick={login}
            disabled={busy}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ delay: 0.65, type: 'spring', stiffness: 220, damping: 18 }}
          >
            Войти через Яндекс
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.p
            className="error"
            initial={{ opacity: 0, y: -8, x: 0 }}
            animate={{ opacity: 1, y: 0, x: [0, -8, 8, -5, 5, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
