import { createSocket, type Socket as UdpSocket } from 'node:dgram'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import {
  sanitizeHandoff,
  sanitizeNowPlaying,
  sanitizeSyncCommand,
  type DeviceRef,
  type DeviceStatus,
  type Handoff,
  type NowPlaying,
  type SyncCommand
} from '../../shared/sync.ts'
import {
  newPairingCode,
  pairProof,
  randomHex,
  requestSignature,
  sameHex,
  wrapToken
} from './crypto.ts'

export const DEFAULT_PORT = 47874
export const DISCOVERY_PORT = 47875
export const DISCOVER_MESSAGE = 'TRASHEE-DISCOVER 1'

const CLOCK_WINDOW_MS = 120_000
const PAIRING_MS = 120_000
const MAX_PAIR_ATTEMPTS = 5
const MAX_BODY_BYTES = 256 * 1024
const KEEPALIVE_MS = 20_000
const PORT_TRIES = 10

export interface PairedDevice {
  id: string
  name: string
  platform: string
  token: string
  pairedAt: number
}

/** What the server tells the app around it; everything that touches the player goes through here. */
export interface SyncHost {
  name: string
  onCommand(from: DeviceRef, command: SyncCommand): void
  onHandoff(from: DeviceRef, handoff: Handoff): void
  /** A phone asks this computer to hand its listening over to it. */
  onPull(from: DeviceRef): void
  onDevicesChanged(devices: DeviceStatus[]): void
}

export interface SyncServerOptions {
  dir: string
  host: SyncHost
  /** 0 picks any free port (tests); by default DEFAULT_PORT or the next free one. */
  port?: number
  /** Where the discovery datagrams are answered; null turns discovery off. */
  discoveryPort?: number | null
  now?: () => number
}

interface Pairing {
  code: string
  expiresAt: number
  attempts: number
}

const json = (response: ServerResponse, status: number, body: unknown): void => {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text)
  })
  response.end(text)
}

const header = (request: IncomingMessage, name: string): string => {
  const value = request.headers[name]
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

const parse = (body: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(body)
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * The computer's end of the link to the phone. The phone finds it (UDP), pairs with a code, and then keeps an
 * event stream open; everything else is a signed request. Nothing here knows about Electron.
 */
export class SyncServer {
  readonly serverId: string
  private readonly options: SyncServerOptions
  private readonly now: () => number
  private readonly file: string
  private http: Server | null = null
  private udp: UdpSocket | null = null
  private port = 0
  private readonly paired = new Map<string, PairedDevice>()
  private readonly streams = new Map<string, ServerResponse>()
  private readonly states = new Map<string, NowPlaying>()
  private readonly nonces = new Map<string, number>()
  private pairing: Pairing | null = null
  private hostState: NowPlaying | null = null
  private keepalive: ReturnType<typeof setInterval> | undefined

  constructor(options: SyncServerOptions) {
    this.options = options
    this.now = options.now ?? Date.now
    this.file = join(options.dir, 'sync.json')
    let serverId = ''
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as {
        serverId?: string
        devices?: PairedDevice[]
      }
      serverId = typeof saved.serverId === 'string' ? saved.serverId : ''
      for (const device of saved.devices ?? [])
        if (device && typeof device.id === 'string' && typeof device.token === 'string')
          this.paired.set(device.id, device)
    } catch {
      /* the first start, or a file that cannot be read: nothing is paired yet */
    }
    this.serverId = serverId || randomHex(8)
    if (!serverId) this.save()
  }

  private save(): void {
    try {
      writeFileSync(
        this.file,
        JSON.stringify({ serverId: this.serverId, devices: [...this.paired.values()] })
      )
      chmodSync(this.file, 0o600)
    } catch {
      /* pairing would have to be redone after a restart */
    }
  }

  /** Starts listening; returns the port the phone must use. */
  async start(): Promise<number> {
    const wanted = this.options.port ?? DEFAULT_PORT
    for (let attempt = 0; attempt < (wanted === 0 ? 1 : PORT_TRIES); attempt++) {
      const server = createServer((request, response) => void this.handle(request, response))
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(wanted === 0 ? 0 : wanted + attempt, '0.0.0.0', () => resolve())
        })
      } catch {
        server.close()
        continue
      }
      this.http = server
      this.port = (server.address() as AddressInfo).port
      break
    }
    if (!this.http) throw new Error('Не удалось открыть порт для синхронизации')
    this.startDiscovery()
    this.keepalive = setInterval(() => this.broadcast('ping', { now: this.now() }), KEEPALIVE_MS)
    return this.port
  }

  private startDiscovery(): void {
    const discoveryPort =
      this.options.discoveryPort === undefined ? DISCOVERY_PORT : this.options.discoveryPort
    if (discoveryPort === null) return
    try {
      const socket = createSocket({ type: 'udp4', reuseAddr: true })
      socket.on('error', () => socket.close())
      socket.on('message', (message, remote) => {
        if (message.toString('utf8').trim() !== DISCOVER_MESSAGE) return
        const reply = Buffer.from(
          JSON.stringify({
            app: 'trashee',
            v: 1,
            id: this.serverId,
            name: this.options.host.name,
            port: this.port
          })
        )
        socket.send(reply, remote.port, remote.address)
      })
      socket.bind(discoveryPort)
      this.udp = socket
    } catch {
      /* the phone can still be given the address by hand */
    }
  }

  stop(): void {
    clearInterval(this.keepalive)
    for (const stream of this.streams.values()) stream.end()
    this.streams.clear()
    this.http?.close()
    this.http?.closeAllConnections()
    this.http = null
    try {
      this.udp?.close()
    } catch {
      /* already closed */
    }
    this.udp = null
  }

  /** The addresses a phone can type in, as "ip:port". */
  addresses(): string[] {
    const found: string[] = []
    for (const list of Object.values(networkInterfaces()))
      for (const entry of list ?? [])
        if (entry.family === 'IPv4' && !entry.internal) found.push(`${entry.address}:${this.port}`)
    return found
  }

  /** A new code for the phone to type; the old one stops working. */
  startPairing(): { code: string; expiresAt: number } {
    this.pairing = { code: newPairingCode(), expiresAt: this.now() + PAIRING_MS, attempts: 0 }
    return { code: this.pairing.code, expiresAt: this.pairing.expiresAt }
  }

  cancelPairing(): void {
    this.pairing = null
  }

  devices(): DeviceStatus[] {
    return [...this.paired.values()].map((device) => ({
      id: device.id,
      name: device.name,
      platform: device.platform,
      online: this.streams.has(device.id),
      state: this.states.get(device.id) ?? null
    }))
  }

  forget(id: string): void {
    this.paired.delete(id)
    this.states.delete(id)
    this.streams.get(id)?.end()
    this.streams.delete(id)
    this.save()
    this.changed()
  }

  /** What this computer is playing; every connected phone is told. */
  setHostState(state: NowPlaying | null): void {
    this.hostState = state
    this.broadcast('host', state)
  }

  sendCommand(deviceId: string, command: SyncCommand): boolean {
    return this.sendTo(deviceId, 'command', {
      ...command,
      from: { id: this.serverId, name: this.options.host.name }
    })
  }

  sendHandoff(deviceId: string, handoff: Handoff): boolean {
    return this.sendTo(deviceId, 'handoff', handoff)
  }

  /** Asks a phone to hand its listening over to this computer. */
  sendPull(deviceId: string): boolean {
    return this.sendTo(deviceId, 'pull', {
      from: { id: this.serverId, name: this.options.host.name }
    })
  }

  private sendTo(deviceId: string, event: string, data: unknown): boolean {
    const stream = this.streams.get(deviceId)
    if (!stream) return false
    this.write(stream, event, data)
    return true
  }

  private write(stream: ServerResponse, event: string, data: unknown): void {
    try {
      stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    } catch {
      /* the stream is closing; its close handler cleans up */
    }
  }

  private broadcast(event: string, data: unknown): void {
    for (const stream of this.streams.values()) this.write(stream, event, data)
  }

  /** Everybody learns that a device came, went or changed what it plays. */
  private changed(): void {
    this.options.host.onDevicesChanged(this.devices())
    for (const [id, stream] of this.streams) this.write(stream, 'devices', this.peersOf(id))
  }

  private peersOf(id: string): DeviceStatus[] {
    return this.devices().filter((device) => device.id !== id)
  }

  private authenticate(request: IncomingMessage, path: string, body: string): PairedDevice | null {
    const device = this.paired.get(header(request, 'x-device'))
    const time = Number(header(request, 'x-time'))
    const nonce = header(request, 'x-nonce')
    const signature = header(request, 'x-sig')
    if (!device || !Number.isFinite(time) || !nonce || nonce.length > 64 || !signature) return null
    const now = this.now()
    if (Math.abs(now - time) > CLOCK_WINDOW_MS) return null
    const expected = requestSignature(
      device.token,
      request.method ?? 'GET',
      path,
      time,
      nonce,
      body
    )
    if (!sameHex(expected, signature)) return null
    // A request that was seen once is not accepted again, so a copy of it recorded on the network is useless.
    for (const [seen, until] of this.nonces) if (until < now) this.nonces.delete(seen)
    const key = `${device.id}:${nonce}`
    if (this.nonces.has(key)) return null
    this.nonces.set(key, now + CLOCK_WINDOW_MS)
    return device
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const path = (request.url ?? '/').split('?')[0]
      const body = request.method === 'POST' ? await readBody(request) : ''
      if (request.method === 'POST' && path === '/pair') return this.handlePair(body, response)
      const device = this.authenticate(request, path, body)
      if (!device) return json(response, 401, { error: 'unauthorized' })

      if (request.method === 'GET' && path === '/events')
        return this.openStream(device, request, response)
      if (request.method === 'GET' && path === '/ping') return json(response, 200, { ok: true })
      if (request.method !== 'POST') return json(response, 404, { error: 'not found' })
      const data = parse(body)
      const from: DeviceRef = { id: device.id, name: device.name }

      if (path === '/state') {
        // The phone's clock is not trusted for "when": the moment its state arrives, on this clock, is what counts.
        this.states.set(device.id, {
          ...sanitizeNowPlaying(data, device.id, device.name),
          at: this.now()
        })
        this.changed()
        return json(response, 200, { ok: true })
      }
      const target = typeof data.target === 'string' ? data.target : ''
      if (path === '/command') {
        const command = sanitizeSyncCommand(data.command)
        if (!command || !target) return json(response, 400, { error: 'bad command' })
        if (target === 'host') this.options.host.onCommand(from, command)
        else if (!this.sendTo(target, 'command', { ...command, from }))
          return json(response, 404, { error: 'offline' })
        return json(response, 200, { ok: true })
      }
      if (path === '/handoff') {
        const handoff = sanitizeHandoff(data.handoff, device.id, device.name)
        if (!handoff || !target) return json(response, 400, { error: 'bad handoff' })
        if (target === 'host') this.options.host.onHandoff(from, handoff)
        else if (!this.sendTo(target, 'handoff', handoff))
          return json(response, 404, { error: 'offline' })
        return json(response, 200, { ok: true })
      }
      if (path === '/pull') {
        if (!target) return json(response, 400, { error: 'no target' })
        if (target === 'host') this.options.host.onPull(from)
        else if (!this.sendTo(target, 'pull', { from }))
          return json(response, 404, { error: 'offline' })
        return json(response, 200, { ok: true })
      }
      json(response, 404, { error: 'not found' })
    } catch {
      if (!response.headersSent) json(response, 400, { error: 'bad request' })
    }
  }

  private handlePair(body: string, response: ServerResponse): void {
    const data = parse(body)
    const pairing = this.pairing
    if (!pairing || pairing.expiresAt < this.now())
      return json(response, 403, { error: 'no pairing is open' })
    const deviceId = typeof data.deviceId === 'string' ? data.deviceId.slice(0, 64) : ''
    const nonce = typeof data.nonce === 'string' ? data.nonce.slice(0, 64) : ''
    const proof = typeof data.proof === 'string' ? data.proof : ''
    if (!deviceId || !nonce || !proof) return json(response, 400, { error: 'bad request' })
    if (!sameHex(pairProof(pairing.code, deviceId, nonce), proof)) {
      pairing.attempts += 1
      if (pairing.attempts >= MAX_PAIR_ATTEMPTS) this.pairing = null
      return json(response, 403, { error: 'wrong code' })
    }
    const token = randomHex(32)
    const name =
      typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 60) : 'Телефон'
    const platform = typeof data.platform === 'string' ? data.platform.slice(0, 20) : 'android'
    this.paired.set(deviceId, { id: deviceId, name, platform, token, pairedAt: this.now() })
    this.pairing = null
    this.save()
    json(response, 200, {
      serverId: this.serverId,
      serverName: this.options.host.name,
      token: wrapToken(token, pairing.code, nonce)
    })
    this.changed()
  }

  private openStream(
    device: PairedDevice,
    request: IncomingMessage,
    response: ServerResponse
  ): void {
    // One stream per device: a phone that reconnects replaces the stale connection.
    this.streams.get(device.id)?.end()
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    })
    this.streams.set(device.id, response)
    this.write(response, 'hello', {
      serverId: this.serverId,
      serverName: this.options.host.name,
      now: this.now()
    })
    this.write(response, 'host', this.hostState)
    this.write(response, 'devices', this.peersOf(device.id))
    request.on('close', () => {
      if (this.streams.get(device.id) !== response) return
      this.streams.delete(device.id)
      this.changed()
    })
    this.changed()
  }
}
