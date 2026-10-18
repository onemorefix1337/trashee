import type { JSX } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { refKey } from '../../../shared/collections'
import type { Account, Pin } from '../../../shared/types'
import { coverUrl } from '../lib/cover'
import { usePins } from '../store/library'
import { navigate, openCollection, openSearch, useRoute, type Route } from '../store/nav'
import { toggleMini, useMiniVisible } from '../store/mini'
import { currentTrack, startWave, usePlayer } from '../store/player'
import { updateSettings, useSettings } from '../store/settings'
import AccountMenu from './AccountMenu'
import { ChevronIcon, GearIcon, LibraryIcon, MiniPlayerIcon, SearchIcon, WaveIcon } from './Icons'
import Logo from './Logo'

const NAV_SPRING = { type: 'spring', stiffness: 400, damping: 32 } as const

interface NavItemProps {
  label: string
  active: boolean
  /** Lit without the page pill, for switches that are not pages. */
  on?: boolean
  collapsed: boolean
  onClick: () => void
  children: JSX.Element
}

function NavItem({ label, active, on, collapsed, onClick, children }: NavItemProps): JSX.Element {
  return (
    <motion.button
      className={`nav-item${active ? ' active' : ''}${on ? ' on' : ''}`}
      data-label={label}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      whileTap={{ scale: 0.96 }}
    >
      {active && <motion.span layoutId="nav-pill" className="nav-pill" transition={NAV_SPRING} />}
      <span className="nav-icon">{children}</span>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            className="nav-label"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function PinItem({
  pin,
  index,
  active,
  collapsed
}: {
  pin: Pin
  index: number
  active: boolean
  collapsed: boolean
}): JSX.Element {
  const cover = pin.coverUri ? coverUrl({ coverUri: pin.coverUri }, '100x100') : null
  // A pinned wave can only be started when the server told us its seed.
  const playable = pin.type !== 'wave' || pin.seed !== undefined

  const open = (): void => {
    if (pin.type === 'wave') {
      if (!pin.seed) return
      navigate({ page: 'player' })
      void startWave(pin.seed)
    } else if (pin.ref) {
      openCollection(pin.ref)
    }
  }

  return (
    <motion.button
      layout="position"
      className={`pin${active ? ' active' : ''}${pin.type === 'artist' ? ' round' : ''}`}
      title={`${pin.title} · ${pin.subtitle}`}
      onClick={open}
      disabled={!playable}
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -14, height: 0 }}
      transition={{
        type: 'spring',
        stiffness: 320,
        damping: 30,
        delay: Math.min(index, 10) * 0.03
      }}
      whileTap={{ scale: 0.97 }}
    >
      <span className={`pin-cover${pin.type === 'wave' ? ' wave' : ''}`}>
        {cover ? <img src={cover} alt="" loading="lazy" /> : pin.type === 'wave' ? null : <span />}
      </span>
      {!collapsed && (
        <span className="pin-text">
          <span className="title">{pin.title}</span>
          <span className="artist">{pin.subtitle}</span>
        </span>
      )}
    </motion.button>
  )
}

function isPageRoute(route: Route, page: Route['page']): boolean {
  return route.page === page
}

export default function Sidebar({
  account,
  onLogout
}: {
  account: Account
  onLogout: () => void
}): JSX.Element {
  const route = useRoute()
  const pins = usePins()
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const playing = usePlayer((s) => currentTrack(s) !== undefined)
  const miniVisible = useMiniVisible()
  const openKey = route.page === 'collection' ? refKey(route.ref) : null

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="brand">
        <Logo size={26} />
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              className="brand-name"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
            >
              trashee
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <nav className="nav">
        <NavItem
          label={playing ? 'Сейчас играет' : 'Моя волна'}
          active={isPageRoute(route, 'player')}
          collapsed={collapsed}
          onClick={() => navigate({ page: 'player' })}
        >
          <WaveIcon size={22} />
        </NavItem>
        <NavItem
          label="Поиск"
          active={isPageRoute(route, 'search')}
          collapsed={collapsed}
          onClick={openSearch}
        >
          <SearchIcon size={22} />
        </NavItem>
        <NavItem
          label="Коллекция"
          active={isPageRoute(route, 'library')}
          collapsed={collapsed}
          onClick={() => navigate({ page: 'library' })}
        >
          <LibraryIcon size={22} />
        </NavItem>
      </nav>

      <div className="pins">
        <AnimatePresence initial={false}>
          {pins.length > 0 && !collapsed && (
            <motion.div
              key="label"
              className="pins-label"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Закреплённое
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial>
          {pins.map((pin, index) => (
            <PinItem
              key={pin.key}
              pin={pin}
              index={index}
              active={openKey === pin.key}
              collapsed={collapsed}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="side-bottom">
        <NavItem
          label={miniVisible ? 'Скрыть мини-плеер' : 'Мини-плеер'}
          active={false}
          on={miniVisible}
          collapsed={collapsed}
          onClick={toggleMini}
        >
          <MiniPlayerIcon size={22} />
        </NavItem>
        <NavItem
          label="Настройки"
          active={isPageRoute(route, 'settings')}
          collapsed={collapsed}
          onClick={() => navigate({ page: 'settings' })}
        >
          <GearIcon size={22} />
        </NavItem>
        <AccountMenu account={account} collapsed={collapsed} onLogout={onLogout} />
        <motion.button
          className="collapse-btn"
          onClick={() => updateSettings({ sidebarCollapsed: !collapsed })}
          aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          title={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.88 }}
        >
          <ChevronIcon size={18} flip={collapsed} />
        </motion.button>
      </div>
    </aside>
  )
}
