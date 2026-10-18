import { Menu, Tray, app, ipcMain, nativeImage, type BrowserWindow } from 'electron'
import { sanitizeMiniTrack, type MiniCommand, type MiniTrack } from '../shared/mini'
import { barsBitmap, trayEntries, type TrayAction } from '../shared/tray'

// Brand colors of the logo, top to bottom.
const GRADIENT: [number, number, number][] = [
  [255, 107, 139],
  [255, 154, 98],
  [143, 107, 255]
]

function gradientAt(position: number): [number, number, number] {
  const scaled = Math.min(0.999, Math.max(0, position)) * (GRADIENT.length - 1)
  const from = GRADIENT[Math.floor(scaled)]
  const to = GRADIENT[Math.floor(scaled) + 1]
  const mix = scaled - Math.floor(scaled)
  return [0, 1, 2].map((i) => Math.round(from[i] + (to[i] - from[i]) * mix)) as [
    number,
    number,
    number
  ]
}

/** The logo for the tray: a black template on macOS (the menu bar tints it), the colored mark elsewhere. */
function createIcon(): Electron.NativeImage {
  const mac = process.platform === 'darwin'
  const points = mac ? 18 : process.platform === 'linux' ? 24 : 16
  const size = points * 2
  const { data, width, height } = barsBitmap(size, (row) =>
    mac ? [0, 0, 0] : gradientAt(row / (size - 1))
  )
  const image = nativeImage.createFromBitmap(Buffer.from(data), {
    width,
    height,
    scaleFactor: 2
  })
  if (mac) image.setTemplateImage(true)
  return image
}

let tray: Tray | null = null
let track: MiniTrack | null = null
// Linux desktops do not all show tray icons; without one, hiding the window would lose it.
let closeToTray = process.platform !== 'linux'
let playerWindow: () => BrowserWindow | null = () => null
let toggleMiniCard: () => void = () => undefined
let miniShown: () => boolean = () => false

/** True when closing the window should only hide it, so the music goes on and the tray brings it back. */
export const hidesOnClose = (): boolean => closeToTray && tray !== null && !tray.isDestroyed()

function showWindow(): void {
  const window = playerWindow()
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function toggleWindow(): void {
  const window = playerWindow()
  if (!window || window.isDestroyed()) return
  if (window.isVisible() && !window.isMinimized() && window.isFocused()) window.hide()
  else showWindow()
}

function act(action: TrayAction): void {
  if (action === 'show') toggleWindow()
  else if (action === 'mini') toggleMiniCard()
  else if (action === 'quit') app.quit()
  else {
    const window = playerWindow()
    if (window && !window.isDestroyed())
      window.webContents.send('mini:command', action satisfies MiniCommand)
  }
}

/** Rebuilds the menu for what is playing and shown now. */
export function refreshTray(): void {
  if (!tray || tray.isDestroyed()) return
  const window = playerWindow()
  const visible = !!window && !window.isDestroyed() && window.isVisible()
  const menu = Menu.buildFromTemplate(
    trayEntries(track, visible, miniShown()).map((entry) =>
      entry.separator
        ? { type: 'separator' as const }
        : {
            label: entry.label,
            enabled: entry.enabled !== false,
            click: entry.id ? () => act(entry.id as TrayAction) : undefined
          }
    )
  )
  tray.setContextMenu(menu)
  tray.setToolTip(track ? `${track.title}${track.artist ? ` — ${track.artist}` : ''}` : 'trashee')
}

export function registerTray(options: {
  window: () => BrowserWindow | null
  toggleMini: () => void
  miniVisible: () => boolean
}): void {
  playerWindow = options.window
  toggleMiniCard = options.toggleMini
  miniShown = options.miniVisible
  tray = new Tray(createIcon())
  // On Windows and Linux a click on the icon shows or hides the window; macOS opens the menu instead.
  if (process.platform !== 'darwin') tray.on('click', toggleWindow)
  refreshTray()

  ipcMain.on('mini:state', (event, raw: unknown) => {
    const window = playerWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return
    track = sanitizeMiniTrack(raw)
    refreshTray()
  })
  ipcMain.on('settings:set-close-to-tray', (event, value: unknown) => {
    const window = playerWindow()
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return
    if (typeof value === 'boolean') closeToTray = value
  })
  app.on('will-quit', () => tray?.destroy())
}
