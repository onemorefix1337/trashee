import { createConnection, type Socket } from 'node:net'
import { app, ipcMain, type BrowserWindow } from 'electron'
import {
  OP_CLOSE,
  OP_FRAME,
  OP_HANDSHAKE,
  OP_PING,
  OP_PONG,
  buildActivity,
  decodePackets,
  encodePacket,
  type PresenceInfo
} from '../shared/discord'

/**
 * The Application ID of the app registered at discord.com/developers (its name is what Discord shows after
 * "Listening to"). While it is empty the setting stays hidden and nothing connects. The environment variable
 * TRASHEE_DISCORD_CLIENT_ID sets it for a try without editing the code.
 */
export const DISCORD_CLIENT_ID = process.env.TRASHEE_DISCORD_CLIENT_ID ?? ''

const RECONNECT_MS = 15_000
const SEND_DELAY_MS = 700
const PIPES = 10

/** Where Discord listens: a named pipe on Windows, a socket in one of the runtime folders elsewhere. */
function socketPaths(): string[] {
  if (process.platform === 'win32')
    return Array.from({ length: PIPES }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`)
  const runtime = process.env.XDG_RUNTIME_DIR
  const bases = [
    runtime,
    runtime && `${runtime}/app/com.discordapp.Discord`,
    runtime && `${runtime}/snap.discord`,
    process.env.TMPDIR,
    process.env.TMP,
    process.env.TEMP,
    '/tmp'
  ].filter((base, i, all): base is string => !!base && all.indexOf(base) === i)
  return bases.flatMap((base) =>
    Array.from({ length: PIPES }, (_, i) => `${base}/discord-ipc-${i}`)
  )
}

function tryConnect(path: string): Promise<Socket | null> {
  return new Promise((resolve) => {
    const socket = createConnection(path)
    socket.once('connect', () => resolve(socket))
    socket.once('error', () => {
      socket.destroy()
      resolve(null)
    })
  })
}

class Presence {
  private socket: Socket | null = null
  private ready = false
  private enabled = false
  private connecting = false
  private info: PresenceInfo | null = null
  private clearSent = false
  private reconnect: ReturnType<typeof setTimeout> | undefined
  private sendTimer: ReturnType<typeof setTimeout> | undefined
  private nonce = 0
  private buffer: Uint8Array = new Uint8Array(0)

  enable(on: boolean): void {
    this.enabled = on
    if (on) void this.connect()
    else this.shutdown()
  }

  update(info: PresenceInfo | null): void {
    this.info = info
    clearTimeout(this.sendTimer)
    this.sendTimer = setTimeout(() => this.flush(), SEND_DELAY_MS)
  }

  private async connect(): Promise<void> {
    if (this.socket || this.connecting || !this.enabled) return
    this.connecting = true
    let socket: Socket | null = null
    for (const path of socketPaths()) {
      socket = await tryConnect(path)
      if (socket) break
    }
    this.connecting = false
    if (!socket || !this.enabled) {
      socket?.destroy()
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    this.buffer = new Uint8Array(0)
    socket.on('data', (data) => this.onData(data))
    socket.on('error', () => undefined)
    socket.on('close', () => this.onClosed(socket))
    socket.write(encodePacket(OP_HANDSHAKE, { v: 1, client_id: DISCORD_CLIENT_ID }))
  }

  private onData(data: Buffer): void {
    const joined = new Uint8Array(this.buffer.length + data.length)
    joined.set(this.buffer)
    joined.set(data, this.buffer.length)
    try {
      const { packets, rest } = decodePackets(joined)
      this.buffer = rest
      for (const { op, payload } of packets) {
        if (op === OP_PING) this.socket?.write(encodePacket(OP_PONG, payload))
        else if (op === OP_CLOSE) this.socket?.destroy()
        else if (op === OP_FRAME && (payload as { evt?: string } | null)?.evt === 'READY') {
          this.ready = true
          // A fresh connection starts with nothing shown, so there is nothing to clear.
          this.clearSent = true
          this.flush()
        }
      }
    } catch {
      this.socket?.destroy()
    }
  }

  private onClosed(socket: Socket): void {
    if (this.socket !== socket) return
    this.socket = null
    this.ready = false
    this.clearSent = false
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    clearTimeout(this.reconnect)
    if (this.enabled) this.reconnect = setTimeout(() => void this.connect(), RECONNECT_MS)
  }

  private flush(): void {
    if (!this.socket || !this.ready) return
    const activity = this.info ? buildActivity(this.info, Date.now()) : null
    // Clearing twice in a row says nothing new, and Discord limits how often presence may be updated.
    if (activity === null && this.clearSent) return
    this.clearSent = activity === null
    this.socket.write(
      encodePacket(OP_FRAME, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, ...(activity ? { activity } : {}) },
        nonce: String(this.nonce++)
      })
    )
  }

  private shutdown(): void {
    clearTimeout(this.reconnect)
    clearTimeout(this.sendTimer)
    this.info = null
    if (this.socket && this.ready) this.flush()
    this.socket?.destroy()
    this.socket = null
    this.ready = false
    this.clearSent = false
  }

  destroy(): void {
    this.enabled = false
    this.shutdown()
  }
}

const asText = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.slice(0, limit) : ''
const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0

/** What the player window may tell Discord; anything else about the track stays on this computer. */
function sanitizePresence(raw: unknown): PresenceInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  if (typeof input.title !== 'string') return null
  const cover = asText(input.coverUrl, 500)
  return {
    title: asText(input.title, 200),
    artist: asText(input.artist, 200),
    coverUrl: cover.startsWith('https://') ? cover : undefined,
    durationSec: asNumber(input.durationSec),
    positionSec: asNumber(input.positionSec)
  }
}

export function registerDiscord(playerWindow: () => BrowserWindow | null): void {
  const available = DISCORD_CLIENT_ID !== ''
  const presence = new Presence()
  const fromPlayer = (sender: Electron.WebContents): boolean => {
    const window = playerWindow()
    return !!window && !window.isDestroyed() && sender === window.webContents
  }

  ipcMain.handle('discord:available', () => available)
  if (!available) return
  ipcMain.on('discord:enable', (event, on: unknown) => {
    if (fromPlayer(event.sender) && typeof on === 'boolean') presence.enable(on)
  })
  ipcMain.on('discord:presence', (event, raw: unknown) => {
    if (fromPlayer(event.sender)) presence.update(sanitizePresence(raw))
  })
  app.on('will-quit', () => presence.destroy())
}
