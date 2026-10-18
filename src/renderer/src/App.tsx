import { useEffect, useState, type JSX } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import type { Account, Restore } from '../../shared/types'
import { artistNames, coverUrl, dominantColor, publicCoverUrl, type Rgb } from './lib/cover'
import { loadPins, resetLibrary } from './store/library'
import {
  back,
  navigate,
  openSearch,
  resetNavigation,
  routeKey,
  useRoute,
  type Route
} from './store/nav'
import {
  currentTrack,
  dislikeCurrent,
  getPlayerState,
  likeCurrent,
  loadLikedIds,
  next,
  previous,
  resetPlayer,
  seekBy,
  setEqualizer,
  setSpeed,
  toggle,
  usePlayer
} from './store/player'
import { connectMini, useMiniLine, useMiniLook, useMiniVisible } from './store/mini'
import { connectOffline } from './store/offline'
import { useSettings } from './store/settings'
import { closeToTrayOn } from '../../shared/settings'
import { connectUpdates, useAppInfo } from './store/update'
import Ambient from './components/Ambient'
import BackButton from './components/BackButton'
import CollectionPage from './components/CollectionPage'
import LibraryPage from './components/LibraryPage'
import Login from './components/Login'
import MiniBar from './components/MiniBar'
import Offline from './components/Offline'
import PlayerPage from './components/PlayerPage'
import SearchPage from './components/SearchPage'
import SettingsPage from './components/SettingsPage'
import SimilarPage from './components/SimilarPage'
import Sidebar from './components/Sidebar'
import ToastHost from './components/ToastHost'
import PlaylistPicker from './components/PlaylistPicker'
import UpdateDialog from './components/UpdateDialog'
import Visualizer from './components/Visualizer'

const SEEK_STEP = 5
const NEUTRAL: Rgb = [255, 255, 255]
const SIDEBAR_WIDTH = { open: '264px', collapsed: '68px' }

/** Tints the interface with the dominant color of the current cover; CSS animates the change. */
function useAccent(): void {
  const track = usePlayer(currentTrack)
  const dynamic = useSettings((s) => s.dynamicColors)
  useEffect(() => {
    const url = dynamic ? coverUrl(track, '100x100') : null
    let stale = false
    const apply = (rgb: Rgb | null): void => {
      const [r, g, b] = rgb ?? NEUTRAL
      const style = document.documentElement.style
      style.setProperty('--ar', String(r))
      style.setProperty('--ag', String(g))
      style.setProperty('--ab', String(b))
    }
    if (!url) {
      apply(null)
      return
    }
    void dominantColor(url).then((rgb) => !stale && apply(rgb))
    return () => {
      stale = true
    }
  }, [track, dynamic])
}

/** Pushes settings to the places that act on them: the main process, the player and the document. */
function useSettingsEffects(): void {
  const quality = useSettings((s) => s.quality)
  const motionLevel = useSettings((s) => s.motion)
  const speed = useSettings((s) => s.speed)
  const gains = useSettings((s) => s.eqGains)
  const closeToTray = useSettings((s) => s.closeToTray)

  useEffect(() => {
    void window.api.setQuality(quality)
  }, [quality])
  useEffect(() => {
    document.documentElement.dataset.motion = motionLevel
  }, [motionLevel])
  useEffect(() => {
    window.api.setCloseToTray(closeToTrayOn(closeToTray, window.api.platform))
  }, [closeToTray])
  useEffect(() => setSpeed(speed), [speed])
  useEffect(() => setEqualizer(gains), [gains])
}

/** Tells Discord what is playing, when the user switched that on. */
function useDiscordPresence(): void {
  const enabled = useSettings((s) => s.discord)
  const track = usePlayer(currentTrack)
  const playing = usePlayer((s) => s.playing)
  const seeks = usePlayer((s) => s.seeks)

  useEffect(() => window.api.setDiscord(enabled), [enabled])
  useEffect(() => {
    if (!enabled) return
    if (!track || !playing) {
      window.api.discordPresence(null)
      return
    }
    const { position, duration } = getPlayerState()
    window.api.discordPresence({
      title: track.title,
      artist: artistNames(track),
      coverUrl: publicCoverUrl(track) ?? undefined,
      durationSec: duration || track.durationMs / 1000,
      positionSec: position
    })
  }, [enabled, track, playing, seeks])
}

/** Keeps the always-on-top mini player in step with the player, and lets it drive the player. */
function useMiniPlayer(): void {
  const track = usePlayer(currentTrack)
  const playing = usePlayer((s) => s.playing)
  const liked = usePlayer((s) => (track ? s.likedIds.has(track.id) : false))
  const shown = useMiniVisible()
  const lyricsOpen = useMiniLook().lyrics
  const line = useMiniLine(track, shown && lyricsOpen)

  useEffect(() => connectMini(), [])
  useEffect(() => {
    window.api.miniState(
      track
        ? {
            title: track.title,
            artist: artistNames(track),
            coverUri: track.coverUri,
            playing,
            liked,
            line
          }
        : null
    )
  }, [track, playing, liked, line])
  useEffect(
    () =>
      window.api.onMiniCommand((command) => {
        if (command === 'toggle') toggle()
        else if (command === 'prev') void previous()
        else if (command === 'next') void next()
        else if (command === 'like') likeCurrent()
        else if (command === 'dislike') void dislikeCurrent()
      }),
    []
  )
}

/** account: undefined while restoring (or offline), null when a login is needed. */
function fromRestore(result: Restore): {
  offline: boolean
  account: Account | null | undefined
  /** Signed in, but Yandex cannot be reached: only what was saved for offline listening works. */
  limited: boolean
} {
  if (result.status === 'ok') {
    return { offline: false, account: result.account, limited: result.offline === true }
  }
  if (result.status === 'offline') return { offline: true, account: undefined, limited: false }
  return { offline: false, account: null, limited: false }
}

function Page({
  route,
  account,
  onLogout
}: {
  route: Route
  account: Account
  onLogout: () => void
}): JSX.Element {
  switch (route.page) {
    case 'player':
      return <PlayerPage />
    case 'search':
      return <SearchPage focusSignal={route.focus} />
    case 'library':
      return <LibraryPage />
    case 'settings':
      return <SettingsPage account={account} onLogout={onLogout} />
    case 'collection':
      return <CollectionPage collectionRef={route.ref} />
    case 'similar':
      return <SimilarPage seed={route.seed} />
  }
}

export default function App(): JSX.Element {
  // undefined: still restoring the saved session
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  const [offline, setOffline] = useState(false)
  const [limited, setLimited] = useState(false)
  const route = useRoute()
  const track = usePlayer(currentTrack)
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const visualizer = useSettings((s) => s.visualizer)
  const motionLevel = useSettings((s) => s.motion)

  useAccent()
  useSettingsEffects()
  useMiniPlayer()
  useDiscordPresence()
  useEffect(() => connectUpdates(), [])
  useEffect(() => connectOffline(), [])
  const appInfo = useAppInfo()

  useEffect(() => {
    void window.api.restoreSession().then((result) => {
      const next = fromRestore(result)
      setOffline(next.offline)
      setLimited(next.limited)
      setAccount(next.account)
    })
  }, [])

  // Started without a connection: keep looking for it, and switch to the full app once it is back.
  useEffect(() => {
    if (!limited) return
    const retry = (): void => {
      void window.api.restoreSession().then((result) => {
        const next = fromRestore(result)
        if (next.account && !next.limited) {
          setLimited(false)
          setAccount(next.account)
        }
      })
    }
    window.addEventListener('online', retry)
    const timer = setInterval(retry, 30_000)
    return () => {
      window.removeEventListener('online', retry)
      clearInterval(timer)
    }
  }, [limited])

  const retryRestore = (): void => {
    setOffline(false)
    void window.api.restoreSession().then((result) => {
      const next = fromRestore(result)
      setOffline(next.offline)
      setLimited(next.limited)
      setAccount(next.account)
    })
  }

  const loginAgain = async (): Promise<void> => {
    await window.api.logout()
    setOffline(false)
    setAccount(null)
  }

  useEffect(() => {
    if (!account) return
    void loadLikedIds()
    void loadPins()
  }, [account])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey
      const typing =
        event.target instanceof HTMLElement &&
        /^(INPUT|TEXTAREA)$/.test(event.target.tagName) &&
        (event.target as HTMLInputElement).type !== 'range'

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openSearch()
      } else if (
        (event.altKey && event.key === 'ArrowLeft') ||
        (event.metaKey && event.key === '[')
      ) {
        event.preventDefault()
        back()
      } else if (mod && event.key === 'ArrowRight') {
        event.preventDefault()
        void next()
      } else if (mod && event.key === 'ArrowLeft') {
        event.preventDefault()
        void previous()
      } else if (typing) {
        return
      } else if (event.code === 'Space') {
        event.preventDefault()
        toggle()
      } else if (event.key === 'ArrowRight') {
        seekBy(SEEK_STEP)
      } else if (event.key === 'ArrowLeft') {
        seekBy(-SEEK_STEP)
      } else if (event.key.toLowerCase() === 'l') {
        likeCurrent()
      } else if (event.key.toLowerCase() === 'd') {
        void dislikeCurrent()
      }
    }
    // The "back" button found on many mice.
    const onMouseUp = (event: MouseEvent): void => {
      if (event.button === 3) back()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const logout = async (): Promise<void> => {
    await window.api.logout()
    resetPlayer()
    resetLibrary()
    setAccount(null)
    resetNavigation()
  }

  let screen: JSX.Element
  if (account === undefined && offline) {
    screen = (
      <motion.div key="offline" className="fill" exit={{ opacity: 0 }}>
        <Offline onRetry={retryRestore} onLoginAgain={() => void loginAgain()} />
      </motion.div>
    )
  } else if (account === undefined) {
    screen = <div key="splash" className="splash" />
  } else if (!account) {
    screen = (
      <motion.div
        key="login"
        className="fill"
        exit={{ opacity: 0, scale: 1.04, filter: 'blur(10px)' }}
        transition={{ duration: 0.35 }}
      >
        <Login onDone={setAccount} />
      </motion.div>
    )
  } else {
    screen = (
      <motion.div
        key="app"
        className="app"
        style={{ ['--rail' as string]: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.open }}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <Ambient />
        <div className="titlebar">
          <BackButton />
        </div>

        <Sidebar account={account} onLogout={() => void logout()} />

        <AnimatePresence>
          {route.page === 'player' && track && visualizer && (
            <motion.div
              key="visualizer"
              className="visualizer-slot"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Visualizer />
            </motion.div>
          )}
        </AnimatePresence>

        <main className="content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={routeKey(route)}
              className="page-frame"
              initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
              transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <Page route={route} account={account} onLogout={() => void logout()} />
            </motion.div>
          </AnimatePresence>
        </main>

        <ToastHost />

        <AnimatePresence>
          {route.page !== 'player' && track && (
            <MiniBar key="mini" onOpen={() => navigate({ page: 'player' })} />
          )}
        </AnimatePresence>
      </motion.div>
    )
  }

  return (
    <MotionConfig reducedMotion={motionLevel === 'full' ? 'user' : 'always'}>
      <AnimatePresence mode="wait">{screen}</AnimatePresence>
      <PlaylistPicker />
      <UpdateDialog currentVersion={appInfo?.version ?? ''} />
    </MotionConfig>
  )
}
