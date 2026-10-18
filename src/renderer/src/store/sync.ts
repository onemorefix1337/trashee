import { useSyncExternalStore } from 'react'
import type { Track } from '../../../shared/types'
import {
  HANDOFF_INLINE,
  handoffWindow,
  type DeviceStatus,
  type Handoff,
  type NowPlaying,
  type SyncCommand,
  type SyncStatus,
  type SyncTrack
} from '../../../shared/sync'
import { artistNames } from '../lib/cover'
import {
  currentTrack,
  dislikeCurrent,
  getPlayerState,
  likeCurrent,
  next,
  pause,
  playQueueAt,
  previous,
  resume,
  seek,
  setVolume,
  toggle
} from './player'
import { showToast } from './toast'

const LOOKUP_CHUNK = 50
/** What goes by while the other device hands over: the track keeps playing there until the answer comes. */
const HANDOVER_LAG_SECONDS = 0.3

interface SyncState {
  enabled: boolean
  hostName: string
  addresses: string[]
  devices: DeviceStatus[]
}

let state: SyncState = { enabled: false, hostName: '', addresses: [], devices: [] }
const listeners = new Set<() => void>()

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function set(next: SyncState): void {
  state = next
  listeners.forEach((listener) => listener())
}

export const useSync = (): SyncState => useSyncExternalStore(subscribe, () => state)

const fromStatus = (status: SyncStatus): SyncState => ({
  enabled: status.enabled,
  hostName: status.hostName,
  addresses: status.addresses,
  devices: status.devices
})

/** Turns phone sync on or off (the main process opens or closes its port) and mirrors the result. */
export async function setSyncEnabled(on: boolean): Promise<void> {
  set(fromStatus(await window.api.syncEnable(on)))
}

export const toSyncTrack = (track: Track): SyncTrack => ({
  id: track.id,
  title: track.title,
  artist: artistNames(track),
  coverUri: track.coverUri,
  durationMs: track.durationMs,
  albumId: track.albums[0]?.id
})

/** What this computer plays now, in the words the phone understands; null when nothing is queued. */
export function describeNowPlaying(): NowPlaying | null {
  const player = getPlayerState()
  const track = currentTrack(player)
  if (!track) return null
  return {
    device: '',
    name: '',
    track: toSyncTrack(track),
    playing: player.playing,
    positionMs: Math.round(player.position * 1000),
    at: Date.now(),
    queueLength: player.queue.length,
    index: player.index
  }
}

function applyCommand(command: SyncCommand): void {
  switch (command.cmd) {
    case 'toggle':
      toggle()
      break
    case 'play':
      void resume()
      break
    case 'pause':
      pause()
      break
    case 'next':
      void next()
      break
    case 'prev':
      void previous()
      break
    case 'seek':
      seek((command.value ?? 0) / 1000)
      break
    case 'volume':
      setVolume(command.value ?? 1)
      break
    case 'like':
      likeCurrent()
      break
    case 'dislike':
      void dislikeCurrent()
      break
  }
}

async function lookUp(ids: string[]): Promise<Track[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) chunks.push(ids.slice(i, i + LOOKUP_CHUNK))
  return (await Promise.all(chunks.map((chunk) => window.api.tracks(chunk)))).flat()
}

/** Takes over a listening session another device sent: same queue, same track, same second. */
async function receiveHandoff(fromName: string, handoff: Handoff): Promise<void> {
  const started = Date.now()
  try {
    const found = new Map((await lookUp(handoff.queue)).map((track) => [track.id, track]))
    const queue = handoff.queue
      .map((id) => found.get(id))
      .filter((track): track is Track => !!track)
    if (queue.length === 0) throw new Error('empty')
    const wanted = handoff.queue[handoff.index]
    const index = Math.max(
      0,
      queue.findIndex((track) => track.id === wanted)
    )
    const lag = handoff.playing ? (Date.now() - started) / 1000 + HANDOVER_LAG_SECONDS : 0
    playQueueAt(queue, index, handoff.positionMs / 1000 + lag, handoff.playing)
    showToast(`Играет с «${fromName}»`)
  } catch {
    showToast(`Не удалось принять музыку с «${fromName}»`)
  }
}

/** Sends the current queue to a device and, once it has it, stops here. */
export async function handoffTo(deviceId: string, deviceName?: string): Promise<boolean> {
  const player = getPlayerState()
  if (!currentTrack(player)) {
    showToast('Сейчас ничего не играет')
    return false
  }
  const { items, index } = handoffWindow(player.queue, player.index)
  const handoff: Handoff = {
    from: '',
    fromName: '',
    queue: items.map((track) => track.id),
    index,
    positionMs: Math.round(player.position * 1000),
    at: Date.now(),
    playing: player.playing,
    tracks: items.slice(index, index + HANDOFF_INLINE).map(toSyncTrack)
  }
  const delivered = await window.api.syncHandoff(deviceId, handoff)
  if (delivered) {
    pause()
    if (deviceName) showToast(`Передано на «${deviceName}»`)
  } else {
    showToast('Устройство не в сети')
  }
  return delivered
}

/** Asks a device to hand over what it plays. */
export async function pullFrom(deviceId: string): Promise<boolean> {
  const delivered = await window.api.syncPullFrom(deviceId)
  if (!delivered) showToast('Устройство не в сети')
  return delivered
}

export const controlDevice = (deviceId: string, command: SyncCommand): Promise<boolean> =>
  window.api.syncCommand(deviceId, command)

/** Says so, once, when a phone starts playing while this computer is silent, and offers to take it over. */
function offerTakeOver(before: DeviceStatus[], after: DeviceStatus[]): void {
  if (getPlayerState().playing) return
  for (const device of after) {
    const was = before.find((candidate) => candidate.id === device.id)
    if (!device.state?.playing || was?.state?.playing || !device.state.track) continue
    showToast(`Играет на «${device.name}»: ${device.state.track.title}`, {
      label: 'Забрать',
      run: () => void pullFrom(device.id)
    })
  }
}

/** Follows the main process: who is paired and online, and what they ask this computer to do. */
export function connectSync(): () => void {
  let stale = false
  void window.api.syncStatus().then((status) => {
    if (!stale && status) set(fromStatus(status))
  })
  const stops = [
    window.api.onSyncDevices((devices) => {
      const before = state.devices
      set({ ...state, devices })
      offerTakeOver(before, devices)
    }),
    window.api.onSyncCommand(({ command }) => applyCommand(command)),
    window.api.onSyncHandoff(({ from, handoff }) => void receiveHandoff(from.name, handoff)),
    window.api.onSyncPull(({ from }) => void handoffTo(from.id, from.name))
  ]
  return () => {
    stale = true
    stops.forEach((stop) => stop())
  }
}
