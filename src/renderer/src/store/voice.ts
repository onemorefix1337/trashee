import { useSyncExternalStore } from 'react'
import {
  INITIAL_VOICE_MODEL,
  VOICE_COMMANDS,
  parseVoice,
  type VoiceAction,
  type VoiceEvent,
  type VoiceModelState
} from '../../../shared/voice'
import {
  currentTrack,
  dislikeCurrent,
  getPlayerState,
  next,
  pause,
  previous,
  resume,
  returnToWave,
  seek,
  setVolume,
  toggleLike,
  toggleShuffle
} from './player'
import { getSettings, subscribeSettings, updateSettings } from './settings'
import { showToast } from './toast'

export type VoicePhase = 'off' | 'starting' | 'listening' | 'error'

export interface VoiceUi {
  phase: VoicePhase
  /** The last thing that was heard, understood or not. */
  heard: string
  error: string | null
  model: VoiceModelState
}

/** The same command twice in this time is one command: the recognizer can write a phrase down twice. */
const SAME_COMMAND_MS = 1500
const VOLUME_STEP = 0.15

let ui: VoiceUi = { phase: 'off', heard: '', error: null, model: INITIAL_VOICE_MODEL }
const listeners = new Set<() => void>()

function set(patch: Partial<VoiceUi>): void {
  ui = { ...ui, ...patch }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useVoice<T>(select: (state: VoiceUi) => T): T {
  return useSyncExternalStore(subscribe, () => select(ui))
}

const labelOf = (action: VoiceAction): string =>
  VOICE_COMMANDS.find((command) => command.type === action.type)?.label ?? action.type

function run(action: VoiceAction): void {
  const player = getPlayerState()
  const track = currentTrack(player)
  switch (action.type) {
    case 'next':
      void next()
      break
    case 'previous':
      void previous()
      break
    case 'pause':
      pause()
      break
    case 'play':
      void resume()
      break
    case 'restart':
      seek(0)
      break
    case 'louder':
      setVolume(Math.min(1, player.volume + VOLUME_STEP))
      break
    case 'quieter':
      setVolume(Math.max(0, player.volume - VOLUME_STEP))
      break
    case 'like':
      if (track && !player.likedIds.has(track.id)) void toggleLike(track)
      break
    case 'unlike':
      if (track && player.likedIds.has(track.id)) void toggleLike(track)
      break
    case 'dislike':
      void dislikeCurrent()
      break
    case 'shuffle':
      if (!player.wave) toggleShuffle()
      break
    case 'wave':
      void returnToWave()
      break
  }
}

let lastAction: { type: string; at: number } | null = null

function heard(text: string): void {
  set({ heard: text })
  const action = parseVoice(text)
  console.info('[voice] heard:', text, '->', action ? action.type : 'nothing')
  if (!action) return
  const now = Date.now()
  if (lastAction && lastAction.type === action.type && now - lastAction.at < SAME_COMMAND_MS) return
  lastAction = { type: action.type, at: now }
  showToast(`Голос: ${labelOf(action)}`)
  run(action)
}

let listening = false
/** Bumped whenever listening starts or stops, so that a start that was still loading finds out it is stale. */
let generation = 0

async function start(): Promise<void> {
  if (listening || ui.phase === 'starting') return
  const mine = ++generation
  const stale = (): boolean => mine !== generation
  set({ phase: 'starting', error: null })
  try {
    if (ui.model.status !== 'ready') {
      const model = await window.api.voiceDownload()
      if (stale()) return
      if (model.status !== 'ready') throw new Error(model.error ?? 'Модель не скачалась')
    }
    // The listening window opens now; "listening" comes back from it once the model is loaded.
    const result = await window.api.voiceListen(true)
    if (stale()) {
      void window.api.voiceListen(false)
      return
    }
    if (!result.ok) throw new Error(result.error ?? 'Не удалось включить микрофон')
    listening = true
  } catch (error) {
    if (stale()) return
    set({ phase: 'error', error: error instanceof Error ? error.message : 'Не удалось включить' })
  }
}

function stop(): void {
  generation += 1
  if (listening || ui.phase === 'starting') void window.api.voiceListen(false)
  listening = false
  if (ui.phase !== 'off') set({ phase: 'off', error: null })
}

function onEvent(event: VoiceEvent): void {
  if (ui.phase === 'off') return
  if (event.kind === 'text') heard(event.text)
  else if (event.kind === 'listening') set({ phase: 'listening', error: null })
  else {
    listening = false
    void window.api.voiceListen(false)
    set({ phase: 'error', error: event.message })
  }
}

/** Starts or stops listening to match the setting. */
function reconcile(): void {
  if (getSettings().voice) void start()
  else stop()
}

/** Turns voice control on or off; turning it on is also what starts the download of the model. */
export function setVoiceEnabled(on: boolean): void {
  updateSettings({ voice: on })
}

/** After an error, tries again. */
export function retryVoice(): void {
  stop()
  reconcile()
}

export function removeVoiceModel(): void {
  updateSettings({ voice: false })
  void window.api.voiceRemoveModel()
}

export function cancelVoiceDownload(): void {
  updateSettings({ voice: false })
  void window.api.voiceCancelDownload()
}

/** Wires voice control to the settings and to the model's download; call once for the life of the window. */
export function connectVoice(): () => void {
  void window.api.voiceModelState().then((model) => model && set({ model }))
  const offModel = window.api.onVoiceModelState((model) => set({ model }))
  const offEvents = window.api.onVoiceEvent(onEvent)
  const offSettings = subscribeSettings(() => {
    const wanted = getSettings().voice
    if (wanted && ui.phase === 'off') reconcile()
    else if (!wanted && ui.phase !== 'off') stop()
  })
  reconcile()
  return () => {
    offModel()
    offEvents()
    offSettings()
    stop()
  }
}
