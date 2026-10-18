import { useSyncExternalStore } from 'react'
import type { Track, WaveEvent } from '../../../shared/types'
import { EQ_BANDS } from '../../../shared/settings'
import { artistNames, publicCoverUrl } from '../lib/cover'
import { getSettings } from './settings'
import { showToast } from './toast'

export type Repeat = 'off' | 'all' | 'one'

export interface PlayerState {
  queue: Track[]
  index: number
  playing: boolean
  loading: boolean
  position: number
  duration: number
  volume: number
  shuffle: boolean
  repeat: Repeat
  wave: { sessionId: string; batchId: string } | null
  likedIds: Set<string>
  error: string | null
}

// The next track is fetched in the background from the middle of the current one at the latest.
const PREFETCH_LAST_SECONDS = 45

const MAX_CONSECUTIVE_ERRORS = 3
const WAVE_REFILL_AT = 2

const readVolume = (): number => {
  try {
    const saved = Number(localStorage.getItem('trashee.volume'))
    return Number.isFinite(saved) && saved > 0 ? Math.min(saved, 1) : 0.8
  } catch {
    return 0.8
  }
}

const audio = new Audio()
audio.preload = 'auto'
// Must be set before the first src: Web Audio only passes sound of media it may inspect (CORS).
audio.crossOrigin = 'anonymous'
audio.volume = readVolume()

let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let equalizer: BiquadFilterNode[] = []
let equalizerGains: number[] = EQ_BANDS.map(() => 0)

/**
 * Routes the player through the equalizer and an analyser (once): audio -> 10 filters -> analyser -> speakers.
 * Returns null when Web Audio is unavailable.
 */
export function getAnalyser(): AnalyserNode | null {
  if (analyser) {
    if (audioContext?.state === 'suspended') void audioContext.resume()
    return analyser
  }
  try {
    const context = new AudioContext()
    const source = context.createMediaElementSource(audio)
    const filters = EQ_BANDS.map((frequency, band) => {
      const filter = context.createBiquadFilter()
      filter.type = band === 0 ? 'lowshelf' : band === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
      filter.frequency.value = frequency
      filter.Q.value = 1
      filter.gain.value = equalizerGains[band] ?? 0
      return filter
    })
    const node = context.createAnalyser()
    node.fftSize = 1024
    node.smoothingTimeConstant = 0.8
    const chain: AudioNode[] = [source, ...filters, node, context.destination]
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1])
    audioContext = context
    equalizer = filters
    analyser = node
    if (context.state === 'suspended') void context.resume()
    return node
  } catch {
    return null
  }
}

/** Gains in dB for each of EQ_BANDS; applied right away, or when the audio graph is first built. */
export function setEqualizer(gains: number[]): void {
  equalizerGains = gains
  equalizer.forEach((filter, band) => {
    filter.gain.setTargetAtTime(gains[band] ?? 0, audioContext?.currentTime ?? 0, 0.03)
  })
}

export function setSpeed(rate: number): void {
  // Loading a new src resets playbackRate to defaultPlaybackRate, so both are set.
  audio.defaultPlaybackRate = rate
  audio.playbackRate = rate
}

let state: PlayerState = {
  queue: [],
  index: -1,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  volume: audio.volume,
  shuffle: false,
  repeat: 'off',
  wave: null,
  likedIds: new Set(),
  error: null
}

const listeners = new Set<() => void>()
let consecutiveErrors = 0
let refilling = false

function set(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePlayer<T>(select: (state: PlayerState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

export const currentTrack = (s: PlayerState): Track | undefined => s.queue[s.index]

/* ---------- wave (Моя волна) ---------- */

function waveFeedback(type: WaveEvent, track?: Track, playedSeconds?: number): void {
  if (!state.wave) return
  window.api
    .waveFeedback(state.wave.sessionId, state.wave.batchId, type, track?.id, playedSeconds)
    .catch(() => undefined)
}

async function refillWave(): Promise<void> {
  const { wave } = state
  const track = currentTrack(state)
  if (!wave || !track || refilling) return
  refilling = true
  try {
    const batch = await window.api.waveNext(wave.sessionId, track.id)
    if (state.wave?.sessionId !== wave.sessionId) return
    const known = new Set(state.queue.map((t) => t.id))
    const fresh = batch.tracks.filter((t) => t.available && !known.has(t.id))
    set({
      queue: [...state.queue, ...fresh],
      wave: { sessionId: wave.sessionId, batchId: batch.batchId }
    })
  } catch {
    /* the next track change will retry */
  } finally {
    refilling = false
  }
}

/* ---------- OS media session (media keys, Now Playing, MPRIS, SMTC) ---------- */

function publishMetadata(track: Track): void {
  if (!('mediaSession' in navigator)) return
  const art = publicCoverUrl(track)
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: artistNames(track),
    album: track.albums[0]?.title ?? '',
    artwork: art ? [{ src: art, sizes: '400x400', type: 'image/jpeg' }] : []
  })
}

function publishPosition(): void {
  if (!('mediaSession' in navigator) || !Number.isFinite(audio.duration)) return
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      position: Math.min(audio.currentTime, audio.duration),
      playbackRate: audio.playbackRate
    })
  } catch {
    /* position state is optional */
  }
}

if ('mediaSession' in navigator) {
  const session = navigator.mediaSession
  session.setActionHandler('play', () => void resume())
  session.setActionHandler('pause', () => pause())
  session.setActionHandler('previoustrack', () => void previous())
  session.setActionHandler('nexttrack', () => void next())
  session.setActionHandler('seekto', (details) => {
    if (details.seekTime !== undefined && details.seekTime !== null) seek(details.seekTime)
  })
  session.setActionHandler('seekbackward', (details) =>
    seek(audio.currentTime - (details.seekOffset ?? 10))
  )
  session.setActionHandler('seekforward', (details) =>
    seek(audio.currentTime + (details.seekOffset ?? 10))
  )
}

/* ---------- playback ---------- */

let prefetchedFor: string | null = null

/** Asks the main process to download the next track while this one plays, so it starts without waiting. */
function maybePrefetch(): void {
  // A shuffled queue picks its next track at random only when it is needed, so there is nothing to fetch.
  if (!getSettings().prefetchNext || (state.shuffle && !state.wave)) return
  const upcoming = state.queue[state.index + 1]
  if (!upcoming || !upcoming.available || upcoming.id === prefetchedFor) return
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return
  const left = audio.duration - audio.currentTime
  if (left <= PREFETCH_LAST_SECONDS || audio.currentTime >= audio.duration / 2) {
    prefetchedFor = upcoming.id
    void window.api.prefetch(upcoming.id).catch(() => undefined)
  }
}

function loadCurrent(): void {
  const track = currentTrack(state)
  if (!track) return
  prefetchedFor = null
  set({ position: 0, duration: track.durationMs / 1000, error: null })
  audio.src = `trashee-media://track/${track.id}`
  getAnalyser()
  audio.play().catch(onPlayRejected)
  publishMetadata(track)
  waveFeedback('trackStarted', track)
  if (state.wave && state.queue.length - state.index <= WAVE_REFILL_AT) void refillWave()
}

function onPlayRejected(error: unknown): void {
  if (error instanceof DOMException && error.name === 'AbortError') return
  handleFailure()
}

function handleFailure(): void {
  consecutiveErrors += 1
  set({ playing: false, loading: false, error: 'Не удалось воспроизвести трек' })
  if (consecutiveErrors < MAX_CONSECUTIVE_ERRORS) setTimeout(() => void next(false), 800)
}

function jump(index: number): void {
  set({ index })
  loadCurrent()
}

export async function next(manual = true): Promise<void> {
  const { queue, index, repeat, shuffle, wave } = state
  if (queue.length === 0) return
  if (manual) waveFeedback('skip', queue[index], audio.currentTime)

  let target = index + 1
  if (shuffle && !wave && queue.length > 1) {
    do target = Math.floor(Math.random() * queue.length)
    while (target === index)
  }
  if (target >= queue.length && wave) {
    await refillWave()
    if (target >= state.queue.length) return
  } else if (target >= queue.length) {
    if (repeat === 'off') {
      audio.pause()
      audio.currentTime = 0
      set({ playing: false, position: 0 })
      return
    }
    target = 0
  }
  jump(target)
}

export async function previous(): Promise<void> {
  if (audio.currentTime > 3 || state.index <= 0) {
    seek(0)
    return
  }
  jump(state.index - 1)
}

export async function resume(): Promise<void> {
  if (!currentTrack(state)) return
  await audio.play().catch(onPlayRejected)
}

export function pause(): void {
  audio.pause()
}

export function toggle(): void {
  if (audio.paused) void resume()
  else pause()
}

export function seek(seconds: number): void {
  const limit = Number.isFinite(audio.duration) ? audio.duration : state.duration
  audio.currentTime = Math.max(0, Math.min(seconds, limit))
  set({ position: audio.currentTime })
  publishPosition()
}

export function seekBy(delta: number): void {
  seek(audio.currentTime + delta)
}

export function likeCurrent(): void {
  const track = currentTrack(state)
  if (track) void toggleLike(track)
}

export function setVolume(volume: number): void {
  audio.volume = volume
  set({ volume })
  try {
    localStorage.setItem('trashee.volume', String(volume))
  } catch {
    /* volume just will not be remembered */
  }
}

export function toggleShuffle(): void {
  set({ shuffle: !state.shuffle })
}

export function cycleRepeat(): void {
  set({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' })
}

/* ---------- replacing the queue, and taking it back ---------- */

interface QueueSnapshot {
  queue: Track[]
  index: number
  wave: PlayerState['wave']
  position: number
}

let previousQueue: QueueSnapshot | null = null

/** Keeps the queue that is about to be replaced, and offers to bring it back when it was worth keeping. */
function rememberQueue(): void {
  if (state.index < 0 || state.queue.length === 0) return
  previousQueue = {
    queue: state.queue,
    index: state.index,
    wave: state.wave,
    position: audio.currentTime
  }
  const worthKeeping = state.wave !== null || state.queue.length - state.index > 1
  if (worthKeeping) {
    showToast(state.wave ? 'Волна заменена' : 'Очередь заменена', {
      label: 'Вернуть',
      run: restoreQueue
    })
  }
}

/** Brings back the queue that was replaced last, at the second where it was left. */
export function restoreQueue(): void {
  const snapshot = previousQueue
  if (!snapshot) return
  previousQueue = null
  consecutiveErrors = 0
  set({ queue: snapshot.queue, index: snapshot.index, wave: snapshot.wave })
  loadCurrent()
  const resumeAt = snapshot.position
  // The position can only be applied once the length of the file is known.
  audio.addEventListener(
    'loadedmetadata',
    () => {
      audio.currentTime = resumeAt
    },
    { once: true }
  )
}

export function playTracks(tracks: Track[], startIndex = 0): void {
  const playable = tracks.filter((track) => track.available)
  const start = playable.indexOf(tracks[startIndex])
  if (playable.length === 0 || start < 0) return
  consecutiveErrors = 0
  rememberQueue()
  set({ queue: playable, wave: null })
  jump(start)
}

export async function startWave(seed?: string): Promise<void> {
  set({ loading: true, error: null })
  try {
    const batch = await window.api.waveStart(seed)
    const tracks = batch.tracks.filter((track) => track.available)
    if (tracks.length === 0) throw new Error('empty wave')
    consecutiveErrors = 0
    rememberQueue()
    set({
      queue: tracks,
      wave: { sessionId: batch.sessionId, batchId: batch.batchId },
      loading: false
    })
    waveFeedback('radioStarted')
    jump(0)
  } catch {
    set({ loading: false, error: 'Не удалось запустить Мою волну' })
  }
}

/** Puts tracks right after the current one and leaves the rest of the queue as it was. */
export function enqueueNext(tracks: Track[]): void {
  const playable = tracks.filter((track) => track.available)
  if (state.index < 0) {
    playTracks(playable)
    return
  }
  const upcoming = new Set(state.queue.slice(state.index + 1).map((track) => track.id))
  const currentId = currentTrack(state)?.id
  const fresh = playable.filter((track) => track.id !== currentId && !upcoming.has(track.id))
  if (fresh.length === 0) {
    showToast('Эти треки уже в очереди')
    return
  }
  set({
    queue: [
      ...state.queue.slice(0, state.index + 1),
      ...fresh,
      ...state.queue.slice(state.index + 1)
    ]
  })
  showToast(`Добавлено в очередь: ${fresh.length}`)
}

/** "Not for me": tells Yandex, skips the track, and offers to take it back. */
export async function dislikeCurrent(): Promise<void> {
  const track = currentTrack(state)
  if (!track) return
  const played = audio.currentTime
  try {
    await window.api.setDislike(track.id, true)
  } catch {
    showToast('Не удалось отметить «Не нравится»')
    return
  }
  waveFeedback('dislike', track, played)
  showToast('Больше не покажем такое', {
    label: 'Отменить',
    run: () => void window.api.setDislike(track.id, false).catch(() => undefined)
  })
  // The dislike already told the radio everything a skip would, so skip quietly.
  await next(false)
}

export function jumpTo(index: number): void {
  if (index >= 0 && index < state.queue.length) jump(index)
}

/* ---------- likes ---------- */

export async function loadLikedIds(): Promise<void> {
  try {
    set({ likedIds: new Set(await window.api.likedIds()) })
  } catch {
    /* likes just will not be highlighted */
  }
}

export async function toggleLike(track: Track): Promise<void> {
  const liked = !state.likedIds.has(track.id)
  const apply = (value: boolean): void => {
    const ids = new Set(state.likedIds)
    if (value) ids.add(track.id)
    else ids.delete(track.id)
    set({ likedIds: ids })
  }
  apply(liked)
  try {
    await window.api.setLike(track.id, liked)
  } catch {
    apply(!liked)
  }
}

export function resetPlayer(): void {
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  set({
    queue: [],
    index: -1,
    playing: false,
    wave: null,
    likedIds: new Set(),
    position: 0,
    duration: 0
  })
}

/* ---------- audio element events ---------- */

audio.addEventListener('play', () => set({ playing: true }))
audio.addEventListener('pause', () => set({ playing: false }))
audio.addEventListener('waiting', () => set({ loading: true }))
audio.addEventListener('playing', () => {
  consecutiveErrors = 0
  set({ loading: false, playing: true })
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
  publishPosition()
})
audio.addEventListener('pause', () => {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
})
audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration)) set({ duration: audio.duration })
})
audio.addEventListener('timeupdate', () => {
  set({ position: audio.currentTime })
  maybePrefetch()
})
audio.addEventListener('error', handleFailure)
audio.addEventListener('ended', () => {
  waveFeedback('trackFinished', currentTrack(state), audio.duration)
  if (state.repeat === 'one') {
    audio.currentTime = 0
    void audio.play()
  } else {
    void next(false)
  }
})
