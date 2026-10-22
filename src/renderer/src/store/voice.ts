import { useSyncExternalStore } from 'react'
import {
  ENROLL_PHRASES,
  REJECTION_TEXT,
  SPEAKER_THRESHOLDS,
  VOICE_COMMANDS,
  initialModelState,
  interpret,
  makeProfile,
  minConfidenceFor,
  type HeardWord,
  type SpeakerProfile,
  type VoiceAction,
  type VoiceConfig,
  type VoiceEvent,
  type VoiceModelKind,
  type VoiceModels
} from '../../../shared/voice'
import { artistNames } from '../lib/cover'
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

export interface Enrollment {
  /** Samples taken so far. */
  step: number
  /** What to read aloud now. */
  phrase: string
}

export interface VoiceUi {
  phase: VoicePhase
  /** The last thing that was heard, understood or not. */
  heard: string
  /** What was done about it, or why nothing was. */
  verdict: string
  error: string | null
  models: VoiceModels
  /** The microphone's level and the level that counts as speech, 0..1; for the meter. */
  level: number
  threshold: number
  profile: SpeakerProfile | null
  enrollment: Enrollment | null
}

/** The same command twice in this time is one command: the recognizer can write a phrase down twice. */
const SAME_COMMAND_MS = 1500
const VOLUME_STEP = 0.15

let ui: VoiceUi = {
  phase: 'off',
  heard: '',
  verdict: '',
  error: null,
  models: { speech: initialModelState('speech'), speaker: initialModelState('speaker') },
  level: 0,
  threshold: 0,
  profile: null,
  enrollment: null
}
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

/** The voice check is on and there is a voice to compare with. */
const checkingVoice = (): boolean => getSettings().voiceSpeakerCheck && ui.profile !== null

function config(): VoiceConfig {
  const settings = getSettings()
  return {
    mode: ui.enrollment ? 'enroll' : 'listen',
    sensitivity: settings.voiceSensitivity,
    noiseSuppression: settings.voiceNoiseSuppression,
    speaker: checkingVoice() ? (ui.profile?.embedding ?? null) : null
  }
}

/** Tells the listening window when something it uses has changed. */
let sentConfig = ''
function pushConfig(): void {
  if (ui.phase !== 'listening' && ui.phase !== 'starting') return
  const next = config()
  const key = JSON.stringify(next)
  if (key === sentConfig) return
  sentConfig = key
  window.api.voiceConfig(next)
}

function announceNowPlaying(): void {
  const track = currentTrack(getPlayerState())
  if (!track) {
    showToast('Сейчас ничего не играет')
    return
  }
  const text = `${track.title} — ${artistNames(track)}`
  showToast(text)
  // The window may be hidden in the tray: the system's notification is seen anyway.
  try {
    new Notification('Сейчас играет', { body: text, silent: true })
  } catch {
    /* the toast is enough */
  }
}

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
    case 'nowPlaying':
      announceNowPlaying()
      break
  }
}

let lastAction: { type: string; at: number } | null = null

function heard(text: string, words: HeardWord[], speaker: number | null): void {
  const result = decide(text, words, speaker)
  console.info('[voice] heard:', text, '->', result)
}

/** Acts on what was heard, or says why not; returns what the settings show. */
function decide(text: string, words: HeardWord[], speaker: number | null): string {
  const settings = getSettings()
  const verdict = interpret(text, words, {
    requireWake: settings.voiceRequireWake,
    minConfidence: minConfidenceFor(settings.voiceSensitivity)
  })
  if (!verdict.action) {
    set({ heard: text, verdict: REJECTION_TEXT[verdict.reason] })
    return REJECTION_TEXT[verdict.reason]
  }
  if (checkingVoice()) {
    const needed = SPEAKER_THRESHOLDS[settings.voiceSpeakerStrictness]
    if (speaker === null) {
      const why = 'голос не с чем сравнить: модель голоса не загрузилась или фраза слишком короткая'
      set({ heard: text, verdict: why })
      return why
    }
    if (speaker < needed) {
      const why = `не твой голос (сходство ${Math.round(speaker * 100)}%)`
      set({ heard: text, verdict: why })
      return why
    }
  }
  const now = Date.now()
  if (
    lastAction &&
    lastAction.type === verdict.action.type &&
    now - lastAction.at < SAME_COMMAND_MS
  ) {
    return 'повтор, пропущен'
  }
  lastAction = { type: verdict.action.type, at: now }
  set({ heard: text, verdict: labelOf(verdict.action) })
  if (verdict.action.type !== 'nowPlaying') showToast(`Голос: ${labelOf(verdict.action)}`)
  run(verdict.action)
  const score = speaker === null ? '' : ` (голос ${Math.round(speaker * 100)}%)`
  return `${verdict.action.type}${score}`
}

/* ---------- learning the user's voice ---------- */

let samples: number[][] = []

function enrollSample(embedding: number[]): void {
  if (!ui.enrollment) return
  samples.push(embedding)
  const step = samples.length
  if (step < ENROLL_PHRASES.length) {
    set({ enrollment: { step, phrase: ENROLL_PHRASES[step] } })
    return
  }
  const profile = makeProfile(samples)
  samples = []
  set({ enrollment: null, profile })
  pushConfig()
  void window.api.voiceSaveProfile(profile)
  updateSettings({ voiceSpeakerCheck: true })
  showToast(
    profile.consistency < 0.5
      ? 'Голос записан, но записи вышли разными. Если будет ошибаться, перезапиши в тишине.'
      : 'Голос записан'
  )
}

/** Starts recording the user's voice: five phrases read aloud, with voice control listening meanwhile. */
export async function startEnrollment(): Promise<void> {
  if (ui.enrollment) return
  if (ui.models.speaker.status !== 'ready') {
    const model = await window.api.voiceDownload('speaker')
    if (model.status !== 'ready') {
      showToast(model.error ?? 'Модель голоса не скачалась')
      return
    }
  }
  samples = []
  set({ enrollment: { step: 0, phrase: ENROLL_PHRASES[0] } })
  if (!getSettings().voice) updateSettings({ voice: true })
  pushConfig()
}

export function cancelEnrollment(): void {
  samples = []
  set({ enrollment: null })
  pushConfig()
}

export function deleteVoiceProfile(): void {
  set({ profile: null })
  updateSettings({ voiceSpeakerCheck: false })
  void window.api.voiceDeleteProfile()
  pushConfig()
}

/** "Only my voice": turning it on without a recorded voice starts recording one. */
export function setSpeakerCheck(on: boolean): void {
  if (on && !ui.profile) {
    void startEnrollment()
    return
  }
  if (on && ui.models.speaker.status !== 'ready') {
    void window.api.voiceDownload('speaker').then((model) => {
      if (model.status === 'ready') updateSettings({ voiceSpeakerCheck: true })
      else showToast(model.error ?? 'Модель голоса не скачалась')
    })
    return
  }
  updateSettings({ voiceSpeakerCheck: on })
}

/* ---------- listening ---------- */

let listening = false
/** Bumped whenever listening starts or stops, so that a start that was still loading finds out it is stale. */
let generation = 0

async function start(): Promise<void> {
  if (listening || ui.phase === 'starting') return
  const mine = ++generation
  const stale = (): boolean => mine !== generation
  set({ phase: 'starting', error: null })
  try {
    if (ui.models.speech.status !== 'ready') {
      const model = await window.api.voiceDownload('speech')
      if (stale()) return
      if (model.status !== 'ready') throw new Error(model.error ?? 'Модель не скачалась')
    }
    if (checkingVoice() && ui.models.speaker.status !== 'ready') {
      const model = await window.api.voiceDownload('speaker')
      if (stale()) return
      if (model.status !== 'ready') throw new Error(model.error ?? 'Модель голоса не скачалась')
    }
    // The listening window opens now; "listening" comes back from it once the model is loaded.
    const first = config()
    sentConfig = JSON.stringify(first)
    const result = await window.api.voiceListen(true, first)
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
  sentConfig = ''
  if (ui.enrollment) cancelEnrollment()
  if (ui.phase !== 'off') set({ phase: 'off', error: null, level: 0 })
}

function onEvent(event: VoiceEvent): void {
  if (ui.phase === 'off') return
  switch (event.kind) {
    case 'heard':
      heard(event.text, event.words, event.speaker)
      break
    case 'sample':
      enrollSample(event.embedding)
      break
    case 'level':
      set({ level: event.level, threshold: event.threshold })
      break
    case 'listening':
      set({ phase: 'listening', error: null })
      pushConfig()
      break
    case 'error':
      listening = false
      void window.api.voiceListen(false)
      set({ phase: 'error', error: event.message })
      break
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

export function removeVoiceModel(kind: VoiceModelKind): void {
  if (kind === 'speech') updateSettings({ voice: false })
  else updateSettings({ voiceSpeakerCheck: false })
  void window.api.voiceRemoveModel(kind)
}

export function cancelVoiceDownload(kind: VoiceModelKind): void {
  if (kind === 'speech') updateSettings({ voice: false })
  void window.api.voiceCancelDownload(kind)
}

/** Wires voice control to the settings and to the downloads; call once for the life of the window. */
export function connectVoice(): () => void {
  void window.api.voiceModels().then((models) => models && set({ models }))
  void window.api.voiceProfile().then((profile) => {
    set({ profile })
    pushConfig()
  })
  const offModels = window.api.onVoiceModels((models) => set({ models }))
  const offEvents = window.api.onVoiceEvent(onEvent)
  const offSettings = subscribeSettings(() => {
    const wanted = getSettings().voice
    if (wanted && ui.phase === 'off') reconcile()
    else if (!wanted && ui.phase !== 'off') stop()
    else pushConfig()
  })
  reconcile()
  return () => {
    offModels()
    offEvents()
    offSettings()
    stop()
  }
}
