/** How the computer and the phone talk about what is playing; the Android app has the same shapes. */

export interface SyncTrack {
  id: string
  title: string
  artist: string
  coverUri?: string
  durationMs: number
  albumId?: number
}

/** What one device is playing. `at` is that device's clock when `positionMs` was true. */
export interface NowPlaying {
  device: string
  name: string
  track: SyncTrack | null
  playing: boolean
  positionMs: number
  at: number
  queueLength: number
  index: number
}

/** A whole listening session handed over: the queue as track ids, where in it, and how far into the track. */
export interface Handoff {
  from: string
  fromName: string
  queue: string[]
  index: number
  positionMs: number
  at: number
  playing: boolean
  /** The first few tracks with their data, so playback can start before the rest of the queue is looked up. */
  tracks: SyncTrack[]
}

/** Who a request or a command came from. */
export interface DeviceRef {
  id: string
  name: string
}

/** A paired phone as the app shows it. */
export interface DeviceStatus {
  id: string
  name: string
  platform: string
  online: boolean
  state: NowPlaying | null
}

/** What the settings page needs to show: whether sync is on, how to reach this computer, who is paired. */
export interface SyncStatus {
  enabled: boolean
  hostName: string
  addresses: string[]
  devices: DeviceStatus[]
}

const SYNC_COMMANDS = [
  'toggle',
  'play',
  'pause',
  'next',
  'prev',
  'seek',
  'volume',
  'like',
  'dislike'
] as const
type SyncCommandName = (typeof SYNC_COMMANDS)[number]

export interface SyncCommand {
  cmd: SyncCommandName
  /** Milliseconds for seek, 0..1 for volume. */
  value?: number
}

/** How much of a queue goes along: a few tracks already played, then the next ones. */
export const HANDOFF_BEHIND = 5
export const HANDOFF_AHEAD = 150
/** How many tracks travel with their data. */
export const HANDOFF_INLINE = 3

const text = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.slice(0, limit) : ''
const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
const whole = (value: unknown): number => Math.max(0, Math.round(number(value)))

export function sanitizeSyncTrack(raw: unknown): SyncTrack | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const id = text(input.id, 64)
  if (!id) return null
  const cover = text(input.coverUri, 500)
  const albumId = number(input.albumId, NaN)
  return {
    id,
    title: text(input.title, 300),
    artist: text(input.artist, 300),
    ...(cover ? { coverUri: cover } : {}),
    durationMs: whole(input.durationMs),
    ...(Number.isFinite(albumId) ? { albumId: Math.round(albumId) } : {})
  }
}

export function sanitizeNowPlaying(raw: unknown, device: string, name: string): NowPlaying {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    // Who the state is from is decided by the connection it came in on, not by what it claims.
    device,
    name,
    track: sanitizeSyncTrack(input.track),
    playing: input.playing === true,
    positionMs: whole(input.positionMs),
    at: whole(input.at),
    queueLength: whole(input.queueLength),
    index: whole(input.index)
  }
}

export function sanitizeHandoff(raw: unknown, from: string, fromName: string): Handoff | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const queue = Array.isArray(input.queue)
    ? input.queue.filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64
      )
    : []
  if (queue.length === 0 || queue.length > HANDOFF_BEHIND + HANDOFF_AHEAD + 1) return null
  const tracks = (Array.isArray(input.tracks) ? input.tracks : [])
    .map(sanitizeSyncTrack)
    .filter((track): track is SyncTrack => track !== null)
    .slice(0, HANDOFF_INLINE + 2)
  return {
    from,
    fromName,
    queue,
    index: Math.min(whole(input.index), queue.length - 1),
    positionMs: whole(input.positionMs),
    at: whole(input.at),
    playing: input.playing !== false,
    tracks
  }
}

export function sanitizeSyncCommand(raw: unknown): SyncCommand | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  if (!SYNC_COMMANDS.includes(input.cmd as SyncCommandName)) return null
  const command: SyncCommand = { cmd: input.cmd as SyncCommandName }
  if (input.cmd === 'seek') command.value = whole(input.value)
  if (input.cmd === 'volume') command.value = Math.min(1, Math.max(0, number(input.value, 1)))
  return command
}

/** Where a track is now, given a state sent a moment ago: it keeps moving while it plays. */
export function estimatePositionMs(state: NowPlaying, nowMs: number, clockOffsetMs = 0): number {
  if (!state.track) return 0
  const moved = state.playing ? Math.max(0, nowMs - clockOffsetMs - state.at) : 0
  const position = state.positionMs + moved
  return state.track.durationMs > 0 ? Math.min(position, state.track.durationMs) : position
}

/** The part of a queue that goes along in a handoff: what was just played and what comes next. */
export function handoffWindow<T>(queue: T[], index: number): { items: T[]; index: number } {
  const from = Math.max(0, index - HANDOFF_BEHIND)
  const items = queue.slice(from, index + HANDOFF_AHEAD + 1)
  return { items, index: index - from }
}
