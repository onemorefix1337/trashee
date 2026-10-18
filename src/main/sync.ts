import { app, ipcMain, type BrowserWindow } from 'electron'
import { hostname } from 'node:os'
import {
  sanitizeHandoff,
  sanitizeNowPlaying,
  sanitizeSyncCommand,
  type NowPlaying,
  type SyncStatus
} from '../shared/sync'
import { SyncServer } from './sync/server'

const hostName = (): string => hostname().replace(/\.local$/i, '') || 'Компьютер'

let server: SyncServer | null = null

/** Phone sync, switched on and off from the settings; while it is off nothing listens on the network. */
export function registerSync(playerWindow: () => BrowserWindow | null): void {
  const fromPlayer = (sender: Electron.WebContents): boolean => {
    const window = playerWindow()
    return !!window && !window.isDestroyed() && sender === window.webContents
  }
  const send = (channel: string, payload: unknown): void => {
    const window = playerWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
  }
  const status = (): SyncStatus => ({
    enabled: server !== null,
    hostName: hostName(),
    addresses: server?.addresses() ?? [],
    devices: server?.devices() ?? []
  })

  async function start(): Promise<void> {
    if (server) return
    const created = new SyncServer({
      dir: app.getPath('userData'),
      host: {
        name: hostName(),
        onCommand: (from, command) => send('sync:command', { from, command }),
        onHandoff: (from, handoff) => send('sync:handoff', { from, handoff }),
        onPull: (from) => send('sync:pull', { from }),
        onDevicesChanged: (devices) => send('sync:devices', devices)
      }
    })
    try {
      await created.start()
      server = created
    } catch {
      created.stop()
    }
  }

  function stop(): void {
    server?.stop()
    server = null
    send('sync:devices', [])
  }

  ipcMain.handle('sync:enable', async (event, on: unknown) => {
    if (!fromPlayer(event.sender) || typeof on !== 'boolean') return status()
    if (on) await start()
    else stop()
    return status()
  })
  ipcMain.handle('sync:status', (event) => (fromPlayer(event.sender) ? status() : null))
  ipcMain.handle('sync:pair', (event) => {
    if (!fromPlayer(event.sender) || !server) return null
    return { ...server.startPairing(), addresses: server.addresses() }
  })
  ipcMain.on('sync:cancel-pair', (event) => {
    if (fromPlayer(event.sender)) server?.cancelPairing()
  })
  ipcMain.on('sync:forget', (event, id: unknown) => {
    if (fromPlayer(event.sender) && typeof id === 'string') server?.forget(id)
  })
  ipcMain.on('sync:publish', (event, raw: unknown) => {
    if (!fromPlayer(event.sender) || !server) return
    if (raw === null) {
      server.setHostState(null)
      return
    }
    const state: NowPlaying = sanitizeNowPlaying(raw, server.serverId, hostName())
    server.setHostState(state.track ? state : null)
  })
  ipcMain.handle('sync:command', (event, id: unknown, raw: unknown) => {
    const command = sanitizeSyncCommand(raw)
    return fromPlayer(event.sender) && server && typeof id === 'string' && command
      ? server.sendCommand(id, command)
      : false
  })
  ipcMain.handle('sync:handoff', (event, id: unknown, raw: unknown) => {
    const handoff = sanitizeHandoff(raw, server?.serverId ?? '', hostName())
    return fromPlayer(event.sender) && server && typeof id === 'string' && handoff
      ? server.sendHandoff(id, handoff)
      : false
  })
  ipcMain.handle('sync:pull-from', (event, id: unknown) =>
    fromPlayer(event.sender) && server && typeof id === 'string' ? server.sendPull(id) : false
  )

  app.on('will-quit', () => server?.stop())
}
