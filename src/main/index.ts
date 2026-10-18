import { app, shell, BrowserWindow, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpc, streamer } from './ipc'
import { destroyMini, registerMini } from './mini'
import { registerUpdater } from './updater'
import { MIN_SIZE, loadWindowBounds, trackWindowBounds } from './window-state'
import { coverResponse } from './yandex/stream'

const SCHEME = 'trashee-media'

app.setName('trashee')

// A second player would fight the first over media keys; bring the running one forward instead.
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.quit()

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

// Lets Chromium publish the player to MPRIS (Linux) and use hardware media keys everywhere.
app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService')
// Playback can start from a media key or a queue advance, not only from a click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url)

// The mini player is a window too, so "the window" must never be looked up with getAllWindows().
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const { maximized, ...bounds } = loadWindowBounds()
  const player = new BrowserWindow({
    ...bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    backgroundColor: '#050505',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 },
    ...(process.platform !== 'darwin'
      ? { titleBarOverlay: { color: '#050505', symbolColor: '#a1a1a1', height: 40 } }
      : {}),
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow = player
  if (maximized) player.maximize()
  trackWindowBounds(player)
  player.on('closed', () => {
    mainWindow = null
    destroyMini()
  })

  player.on('ready-to-show', () => {
    player.show()
  })

  // Links leave the app for the browser; the window itself never navigates away from the player.
  player.webContents.setWindowOpenHandler((details) => {
    if (isWebUrl(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  player.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === new URL(player.webContents.getURL()).origin) return
    event.preventDefault()
    if (isWebUrl(url)) void shell.openExternal(url)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    player.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    player.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (!isPrimaryInstance) return

  electronApp.setAppUserModelId('app.trashee')
  app.setAboutPanelOptions({
    applicationName: 'trashee',
    applicationVersion: app.getVersion(),
    copyright: 'Неофициальный клиент Яндекс Музыки'
  })
  // A packaged macOS app brings its own icon; in development the Dock would show Electron's.
  if (process.platform === 'darwin') app.dock?.setIcon(icon)

  protocol.handle(SCHEME, (request) =>
    new URL(request.url).hostname === 'cover' ? coverResponse(request) : streamer.handle(request)
  )
  registerIpc()
  registerMini(() => mainWindow)
  registerUpdater(() => mainWindow)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (!mainWindow) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
