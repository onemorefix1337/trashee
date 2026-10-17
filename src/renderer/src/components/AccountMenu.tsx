import { useEffect, useRef, useState, type JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Account } from '../../../shared/types'

/** Avatar and name in the sidebar; opens a small menu instead of logging out on the first click. */
export default function AccountMenu({
  account,
  collapsed,
  onLogout
}: {
  account: Account
  collapsed: boolean
  onLogout: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const initial = account.login.slice(0, 1).toUpperCase()

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

  return (
    <div ref={root} className="account">
      <motion.button
        className={`account-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Аккаунт"
        whileTap={{ scale: 0.96 }}
      >
        <span className="avatar sm">{initial}</span>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              className="account-name"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              {account.login}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="account-menu"
            role="menu"
            initial={{ opacity: 0, x: -10, y: 10, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, y: 10, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <div className="account-head">
              <div className="avatar">{initial}</div>
              <div className="account-info">
                <div className="account-login">{account.login}</div>
                <div className={`account-plan${account.hasPlus ? ' plus' : ''}`}>
                  {account.hasPlus ? 'Яндекс Плюс' : 'Без подписки'}
                </div>
              </div>
            </div>
            <button
              className="menu-item danger"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onLogout()
              }}
            >
              Выйти из аккаунта
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
