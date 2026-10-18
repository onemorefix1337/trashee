import { BrowserWindow, app, globalShortcut, ipcMain, screen } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import {
  MINI_SIZE,
  anchorPosition,
  isMiniAnchor,
  isMiniCommand,
  miniShortcut,
  sanitizeMiniConfig,
  sanitizeMiniTrack,
  type MiniConfig,
  type MiniTrack
} from '../shared/mini'
import { restoreBounds } from '../shared/window-bounds'

const SHORTCUT = miniShortcut(process.platform).accelerator
const SAVE_DELAY_MS = 300
// The card plays its closing animation first; if it never answers, the window hides anyway.
const HIDE_FALLBACK_MS = 450
// A move this small is rounding, not the user dragging the card.
const DRAG_TOLERANCE_PX = 2

const configFile = (): string => join(app.getPath('userData'), 'mini.json')

function loadConfig(): MiniConfig {
  try {
    return sanitizeMiniConfig(JSON.parse(readFileSync(configFile(), 'utf8')))
  } catch {
    return sanitizeMiniConfig(null)
  }
}

let config: MiniConfig
let window: BrowserWindow | null = null
let loaded: Promise<void> | null = null
let visible = false
let lastTrack: MiniTrack | null = null
let hideTimer: ReturnType<typeof setTimeout> | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let getPlayerWindow: () => BrowserWindow | null = () => null

function saveConfig(): void {
  try {
    writeFileSync(configFile(), JSON.stringify(config))
  } catch {
    /* losing the position of the card is not worth an error */
  }
}

/** Where the card belongs now: where it was dragged to if that is still on a screen, else its anchor. */
function desiredPosition(): { x: number; y: number } {
  const displays = screen.getAllDisplays()
  if (config.custom) {
    const restored = restoreBounds(
      config.custom,
      displays.map((display) => display.workArea),
      MINI_SIZE,
      MINI_SIZE
    )
    if (restored.x !== undefined && restored.y !== undefined)
      return { x: restored.x, y: restored.y }
  }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  return anchorPosition(config.anchor, area)
}

function place(): void {
  if (!window || window.isDestroyed()) return
  const { x, y } = desiredPosition()
  window.setBounds({ x, y, ...MINI_SIZE })
}

/** Dragging the card is the only way it moves by itself; remember where it was left. */
function rememberDrag(): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!window || window.isDestroyed() || !visible) return
    const [x, y] = window.getPosition()
    const wanted = desiredPosition()
    if (
      Math.abs(x - wanted.x) <= DRAG_TOLERANCE_PX &&
      Math.abs(y - wanted.y) <= DRAG_TOLERANCE_PX
    ) {
      return
    }
    config = { anchor: config.anchor, custom: { x, y } }
    saveConfig()
  }, SAVE_DELAY_MS)
}

function createWindow(): BrowserWindow {
  const created = new BrowserWindow({
    ...MINI_SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Controlling music from over a game or a document must not take the keyboard away from it.
    focusable: false,
    acceptFirstMouse: true,
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/mini.js')
    }
  })
  created.setAlwaysOnTop(true, 'screen-saver')
  if (process.platform === 'darwin') created.setVisibleOnAllWorkspaces(true)

  created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  created.webContents.on('will-navigate', (event) => event.preventDefault())
  created.on('move', rememberDrag)
  created.on('closed', () => {
    window = null
    loaded = null
    if (visible) setVisible(false)
  })

  loaded = new Promise((resolve) => created.webContents.once('did-finish-load', () => resolve()))
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void created.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/mini.html`)
  } else {
    void created.loadFile(join(__dirname, '../renderer/mini.html'))
  }
  return created
}

function setVisible(value: boolean): void {
  visible = value
  const player = getPlayerWindow()
  if (player && !player.isDestroyed()) player.webContents.send('mini:visible', value)
}

export async function showMini(): Promise<void> {
  clearTimeout(hideTimer)
  if (!window || window.isDestroyed()) window = createWindow()
  const target = window
  visible = true
  await loaded
  if (target.isDestroyed()) return
  place()
  target.webContents.send('mini:state', lastTrack)
  target.showInactive()
  target.webContents.send('mini:show')
  setVisible(true)
}

export function hideMini(): void {
  if (!visible || !window || window.isDestroyed()) return
  setVisible(false)
  window.webContents.send('mini:hide')
  clearTimeout(hideTimer)
  hideTimer = setTimeout(finishHide, HIDE_FALLBACK_MS)
}

function finishHide(): void {
  clearTimeout(hideTimer)
  if (!visible && window && !window.isDestroyed()) window.hide()
}

export function toggleMini(): void {
  if (visible) hideMini()
  else void showMini()
}

/** The card goes away together with the player window; nothing is left to control. */
export function destroyMini(): void {
  clearTimeout(hideTimer)
  clearTimeout(saveTimer)
  visible = false
  lastTrack = null
  if (window && !window.isDestroyed()) window.destroy()
  window = null
  loaded = null
}

function focusPlayer(): void {
  const player = getPlayerWindow()
  if (!player || player.isDestroyed()) return
  if (player.isMinimized()) player.restore()
  player.show()
  player.focus()
}

export function registerMini(playerWindow: () => BrowserWindow | null): void {
  getPlayerWindow = playerWindow
  config = loadConfig()

  const fromPlayer = (sender: Electron.WebContents): boolean => {
    const player = getPlayerWindow()
    return !!player && !player.isDestroyed() && sender === player.webContents
  }
  const fromCard = (sender: Electron.WebContents): boolean =>
    !!window && !window.isDestroyed() && sender === window.webContents

  ipcMain.on('mini:state', (event, raw: unknown) => {
    if (!fromPlayer(event.sender)) return
    lastTrack = sanitizeMiniTrack(raw)
    if (window && !window.isDestroyed()) window.webContents.send('mini:state', lastTrack)
  })
  ipcMain.handle('mini:toggle', (event) => {
    if (fromPlayer(event.sender)) toggleMini()
  })
  ipcMain.handle('mini:config', () => ({ anchor: config.anchor, visible }))
  ipcMain.handle('mini:set-anchor', (event, anchor: unknown) => {
    if (!fromPlayer(event.sender) || !isMiniAnchor(anchor)) return
    config = { anchor }
    saveConfig()
    if (visible) place()
  })

  ipcMain.on('mini:command', (event, command: unknown) => {
    if (!fromCard(event.sender) || !isMiniCommand(command)) return
    if (command === 'open') {
      focusPlayer()
      return
    }
    const player = getPlayerWindow()
    if (player && !player.isDestroyed()) player.webContents.send('mini:command', command)
  })
  ipcMain.on('mini:hidden', (event) => {
    if (fromCard(event.sender)) finishHide()
  })
  ipcMain.on('mini:close', (event) => {
    if (fromCard(event.sender)) hideMini()
  })

  if (!globalShortcut.register(SHORTCUT, toggleMini)) {
    console.warn(
      `The shortcut ${SHORTCUT} is taken by another app; the mini player has its button.`
    )
  }
  app.on('will-quit', () => globalShortcut.unregister(SHORTCUT))
}
