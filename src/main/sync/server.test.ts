import assert from 'node:assert/strict'
import { createSocket } from 'node:dgram'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import type { Handoff, NowPlaying, SyncCommand } from '../../shared/sync.ts'
import { pairProof, randomHex, requestSignature, wrapToken } from './crypto.ts'
import { DISCOVER_MESSAGE, SyncServer, type DeviceRef, type DeviceStatus } from './server.ts'

const dirs: string[] = []
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

interface HostLog {
  commands: { from: DeviceRef; command: SyncCommand }[]
  handoffs: { from: DeviceRef; handoff: Handoff }[]
  pulls: DeviceRef[]
  devices: DeviceStatus[][]
}

interface Env {
  server: SyncServer
  port: number
  log: HostLog
  dir: string
  base: string
}

async function setup(
  options: { now?: () => number; discoveryPort?: number | null; dir?: string } = {}
): Promise<Env> {
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), 'trashee-sync-'))
  if (!options.dir) dirs.push(dir)
  const log: HostLog = { commands: [], handoffs: [], pulls: [], devices: [] }
  const server = new SyncServer({
    dir,
    port: 0,
    discoveryPort: options.discoveryPort ?? null,
    now: options.now,
    host: {
      name: 'MacBook',
      onCommand: (from, command) => log.commands.push({ from, command }),
      onHandoff: (from, handoff) => log.handoffs.push({ from, handoff }),
      onPull: (from) => log.pulls.push(from),
      onDevicesChanged: (devices) => log.devices.push(devices)
    }
  })
  const port = await server.start()
  return { server, port, log, dir, base: `http://127.0.0.1:${port}` }
}

/** A phone as the server sees it: pairs with a code, signs requests, listens to the event stream. */
class Phone {
  token = ''
  readonly events: { event: string; data: unknown }[] = []
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  readonly base: string
  readonly id: string
  readonly name: string
  private readonly now: () => number

  constructor(
    base: string,
    id = `phone-${randomHex(4)}`,
    name = 'Pixel',
    now: () => number = Date.now
  ) {
    this.base = base
    this.id = id
    this.name = name
    this.now = now
  }

  async pair(code: string): Promise<Response> {
    const nonce = randomHex(8)
    const response = await fetch(`${this.base}/pair`, {
      method: 'POST',
      body: JSON.stringify({
        deviceId: this.id,
        name: this.name,
        platform: 'android',
        nonce,
        proof: pairProof(code, this.id, nonce)
      })
    })
    if (response.ok) {
      const body = (await response.clone().json()) as { token: string }
      this.token = wrapToken(body.token, code, nonce)
    }
    return response
  }

  signed(
    method: string,
    path: string,
    body = '',
    overrides: { time?: number; nonce?: string; token?: string } = {}
  ): Promise<Response> {
    const time = overrides.time ?? this.now()
    const nonce = overrides.nonce ?? randomHex(8)
    const signature = requestSignature(
      overrides.token ?? this.token,
      method,
      path,
      time,
      nonce,
      body
    )
    return fetch(`${this.base}${path}`, {
      method,
      body: method === 'POST' ? body : undefined,
      headers: { 'x-device': this.id, 'x-time': String(time), 'x-nonce': nonce, 'x-sig': signature }
    })
  }

  post(path: string, data: unknown): Promise<Response> {
    return this.signed('POST', path, JSON.stringify(data))
  }

  async listen(): Promise<void> {
    const response = await this.signed('GET', '/events')
    assert.equal(response.status, 200)
    this.reader = response.body!.getReader()
    void (async () => {
      let buffer = ''
      const decoder = new TextDecoder()
      for (;;) {
        const chunk = await this.reader!.read().catch(() => ({ done: true, value: undefined }))
        if (chunk.done) return
        buffer += decoder.decode(chunk.value, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const event = /^event: (.*)$/m.exec(block)?.[1]
          const data = /^data: (.*)$/m.exec(block)?.[1]
          if (event && data) this.events.push({ event, data: JSON.parse(data) })
        }
      }
    })()
  }

  stop(): void {
    void this.reader?.cancel().catch(() => undefined)
  }

  async waitFor(event: string, since = 0, ms = 2000): Promise<unknown> {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      const found = this.events.slice(since).find((entry) => entry.event === event)
      if (found) return found.data
      await new Promise((resolve) => setTimeout(resolve, 15))
    }
    throw new Error(`no "${event}" event arrived`)
  }
}

const track = { id: '7', title: 'Стеклянный город', artist: 'Аврора Блу', durationMs: 200_000 }

async function pairedPhone(env: Env, now?: () => number): Promise<Phone> {
  const phone = new Phone(env.base, undefined, 'Pixel', now)
  const { code } = env.server.startPairing()
  assert.equal((await phone.pair(code)).status, 200)
  return phone
}

test('a phone that knows the code is paired, and the token it gets works', async () => {
  const env = await setup()
  try {
    const phone = await pairedPhone(env)
    assert.equal(phone.token.length, 64)
    assert.equal((await phone.signed('GET', '/ping')).status, 200)
    assert.deepEqual(
      env.server.devices().map((device) => [device.id, device.name, device.online]),
      [[phone.id, 'Pixel', false]]
    )
  } finally {
    env.server.stop()
  }
})

test('a wrong code is refused, and after five tries the code is gone', async () => {
  const env = await setup()
  try {
    const { code } = env.server.startPairing()
    const phone = new Phone(env.base)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) assert.equal((await phone.pair(wrong)).status, 403)
    assert.equal((await phone.pair(code)).status, 403)
    assert.deepEqual(env.server.devices(), [])
  } finally {
    env.server.stop()
  }
})

test('without an open pairing nobody can pair, and a code stops working after two minutes', async () => {
  let clock = 1_000_000
  const env = await setup({ now: () => clock })
  try {
    const phone = new Phone(env.base, undefined, 'Pixel', () => clock)
    assert.equal((await phone.pair('123456')).status, 403)
    const { code } = env.server.startPairing()
    clock += 121_000
    assert.equal((await phone.pair(code)).status, 403)
  } finally {
    env.server.stop()
  }
})

test('a code works once', async () => {
  const env = await setup()
  try {
    const { code } = env.server.startPairing()
    assert.equal((await new Phone(env.base).pair(code)).status, 200)
    assert.equal((await new Phone(env.base).pair(code)).status, 403)
  } finally {
    env.server.stop()
  }
})

test('requests that are unsigned, wrongly signed, stale or repeated are refused', async () => {
  const clock = 5_000_000
  const env = await setup({ now: () => clock })
  try {
    const phone = await pairedPhone(env, () => clock)
    assert.equal((await fetch(`${env.base}/ping`)).status, 401)
    assert.equal((await phone.signed('GET', '/ping', '', { token: randomHex(32) })).status, 401)
    assert.equal((await phone.signed('GET', '/ping', '', { time: clock - 130_000 })).status, 401)
    assert.equal((await phone.signed('GET', '/ping', '', { time: clock + 130_000 })).status, 401)
    assert.equal((await phone.signed('GET', '/ping', '', { nonce: 'same-nonce' })).status, 200)
    assert.equal((await phone.signed('GET', '/ping', '', { nonce: 'same-nonce' })).status, 401)
    // A signature for one body does not cover another.
    const time = clock
    const signature = requestSignature(
      phone.token,
      'POST',
      '/state',
      time,
      'n1',
      '{"playing":false}'
    )
    const forged = await fetch(`${env.base}/state`, {
      method: 'POST',
      body: '{"playing":true}',
      headers: { 'x-device': phone.id, 'x-time': String(time), 'x-nonce': 'n1', 'x-sig': signature }
    })
    assert.equal(forged.status, 401)
  } finally {
    env.server.stop()
  }
})

test("the event stream greets the phone and carries the computer's state", async () => {
  const env = await setup()
  try {
    const phone = await pairedPhone(env)
    await phone.listen()
    const hello = (await phone.waitFor('hello')) as { serverName: string }
    assert.equal(hello.serverName, 'MacBook')
    assert.equal(env.server.devices()[0].online, true)

    const playing: NowPlaying = {
      device: 'x',
      name: 'x',
      track,
      playing: true,
      positionMs: 1000,
      at: 5,
      queueLength: 4,
      index: 1
    }
    env.server.setHostState(playing)
    const host = (await phone.waitFor('host', phone.events.length - 1)) as NowPlaying
    assert.equal(host.track?.title, 'Стеклянный город')
    phone.stop()
  } finally {
    env.server.stop()
  }
})

test("the phone's own state is stored under its connection and shown to the app", async () => {
  const env = await setup()
  try {
    const phone = await pairedPhone(env)
    const response = await phone.post('/state', {
      device: 'liar',
      track,
      playing: true,
      positionMs: 4200,
      at: 9,
      queueLength: 2,
      index: 0
    })
    assert.equal(response.status, 200)
    const state = env.server.devices()[0].state
    assert.equal(state?.device, phone.id)
    assert.equal(state?.positionMs, 4200)
    assert.ok(
      Math.abs((state?.at ?? 0) - Date.now()) < 5000,
      'the time of the state is the time it arrived'
    )
    assert.equal(env.log.devices.at(-1)?.[0].state?.track?.id, '7')
  } finally {
    env.server.stop()
  }
})

test('commands, handoffs and pulls for the computer reach the app, from a known phone only', async () => {
  const env = await setup()
  try {
    const phone = await pairedPhone(env)
    assert.equal(
      (await phone.post('/command', { target: 'host', command: { cmd: 'seek', value: 30000 } }))
        .status,
      200
    )
    assert.deepEqual(env.log.commands[0].command, { cmd: 'seek', value: 30000 })
    assert.equal(env.log.commands[0].from.id, phone.id)
    assert.equal(
      (await phone.post('/command', { target: 'host', command: { cmd: 'rm -rf' } })).status,
      400
    )

    assert.equal(
      (
        await phone.post('/handoff', {
          target: 'host',
          handoff: { queue: ['1', '2'], index: 1, positionMs: 9000 }
        })
      ).status,
      200
    )
    assert.equal(env.log.handoffs[0].handoff.index, 1)
    assert.equal(env.log.handoffs[0].handoff.from, phone.id)
    assert.equal(
      (await phone.post('/handoff', { target: 'host', handoff: { queue: [] } })).status,
      400
    )

    assert.equal((await phone.post('/pull', { target: 'host' })).status, 200)
    assert.equal(env.log.pulls[0].id, phone.id)
  } finally {
    env.server.stop()
  }
})

test('the computer can command, hand over to and pull from a connected phone, and learns when it is not there', async () => {
  const env = await setup()
  try {
    const phone = await pairedPhone(env)
    assert.equal(env.server.sendCommand(phone.id, { cmd: 'toggle' }), false)
    await phone.listen()
    await phone.waitFor('hello')

    assert.equal(env.server.sendCommand(phone.id, { cmd: 'next' }), true)
    const command = (await phone.waitFor('command')) as { cmd: string; from: DeviceRef }
    assert.equal(command.cmd, 'next')
    assert.equal(command.from.name, 'MacBook')

    const handoff: Handoff = {
      from: 's',
      fromName: 'MacBook',
      queue: ['1', '2'],
      index: 0,
      positionMs: 1000,
      at: 1,
      playing: true,
      tracks: []
    }
    assert.equal(env.server.sendHandoff(phone.id, handoff), true)
    assert.equal(((await phone.waitFor('handoff')) as Handoff).queue.length, 2)

    assert.equal(env.server.sendPull(phone.id), true)
    assert.equal(((await phone.waitFor('pull')) as { from: DeviceRef }).from.name, 'MacBook')
    phone.stop()
  } finally {
    env.server.stop()
  }
})

test('one phone can command another through the computer', async () => {
  const env = await setup()
  try {
    const first = await pairedPhone(env)
    const second = await pairedPhone(env)
    await second.listen()
    await second.waitFor('hello')
    assert.equal(
      (await first.post('/command', { target: second.id, command: { cmd: 'pause' } })).status,
      200
    )
    assert.equal(((await second.waitFor('command')) as { cmd: string }).cmd, 'pause')
    assert.equal(
      (await first.post('/command', { target: 'nobody', command: { cmd: 'pause' } })).status,
      404
    )
    second.stop()
  } finally {
    env.server.stop()
  }
})

test('forgetting a phone cuts it off for good', async () => {
  const env = await setup()
  try {
    const phone = await pairedPhone(env)
    await phone.listen()
    await phone.waitFor('hello')
    env.server.forget(phone.id)
    assert.equal((await phone.signed('GET', '/ping')).status, 401)
    assert.deepEqual(env.server.devices(), [])
    phone.stop()
  } finally {
    env.server.stop()
  }
})

test('paired phones are remembered after a restart', async () => {
  const first = await setup()
  const phone = await pairedPhone(first)
  const serverId = first.server.serverId
  first.server.stop()

  const second = await setup({ dir: first.dir })
  try {
    assert.equal(second.server.serverId, serverId)
    const again = new Phone(second.base, phone.id)
    again.token = phone.token
    assert.equal((await again.signed('GET', '/ping')).status, 200)
    assert.equal(JSON.parse(readFileSync(join(first.dir, 'sync.json'), 'utf8')).devices.length, 1)
  } finally {
    second.server.stop()
  }
})

test('a phone on the network finds the computer by asking everybody', async () => {
  const port = 40000 + Math.floor(Math.random() * 10000)
  const env = await setup({ discoveryPort: port })
  const socket = createSocket('udp4')
  try {
    const answer = new Promise<{ name: string; port: number; id: string }>((resolve) => {
      socket.on('message', (message) => resolve(JSON.parse(message.toString())))
    })
    socket.send(Buffer.from(DISCOVER_MESSAGE), port, '127.0.0.1')
    const found = await answer
    assert.equal(found.name, 'MacBook')
    assert.equal(found.port, env.port)
    assert.equal(found.id, env.server.serverId)
  } finally {
    socket.close()
    env.server.stop()
  }
})

test('a body that is not JSON does not bring the server down', async () => {
  const env = await setup()
  try {
    const phone = await pairedPhone(env)
    assert.equal((await phone.signed('POST', '/state', 'not json')).status, 200)
    assert.equal((await phone.signed('POST', '/command', '{"target":"host"}')).status, 400)
    assert.equal((await phone.signed('GET', '/ping')).status, 200)
  } finally {
    env.server.stop()
  }
})
