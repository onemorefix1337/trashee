import type { Quality } from './types'

export type MotionLevel = 'full' | 'reduced' | 'off'

export interface Settings {
  quality: Quality
  motion: MotionLevel
  visualizer: boolean
  /** Tint the interface with the colors of the cover. */
  dynamicColors: boolean
  sidebarCollapsed: boolean
  /** Closing the window hides it and keeps playing; null means the default of the platform. */
  closeToTray: boolean | null
  /** Show what is playing as the user's Discord status. */
  discord: boolean
  /** Let the phone find this computer on the home network: handing over playback and remote control. */
  sync: boolean
  /** Download the next track in the queue while the current one is still playing. */
  prefetchNext: boolean
  speed: number
  eqPreset: string
  /** One gain in dB for each of EQ_BANDS. */
  eqGains: number[]
}

export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
export const EQ_LIMIT_DB = 12
export const SPEEDS = [0.75, 1, 1.25, 1.5, 2]

export const EQ_PRESETS: { id: string; label: string; gains: number[] }[] = [
  { id: 'flat', label: 'Плоский', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', label: 'Бас', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'vocal', label: 'Вокал', gains: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
  { id: 'treble', label: 'Высокие', gains: [0, 0, 0, 0, 0, 1, 3, 4, 5, 6] },
  { id: 'rock', label: 'Рок', gains: [4, 3, 2, -1, -2, -1, 2, 3, 4, 4] },
  { id: 'electronic', label: 'Электроника', gains: [5, 4, 1, 0, -2, 2, 1, 1, 4, 5] },
  { id: 'acoustic', label: 'Акустика', gains: [3, 3, 2, 1, 1, 1, 2, 2, 3, 2] }
]

export const DEFAULT_SETTINGS: Settings = {
  quality: 'hq',
  motion: 'full',
  visualizer: true,
  dynamicColors: true,
  sidebarCollapsed: false,
  closeToTray: null,
  discord: false,
  sync: false,
  prefetchNext: true,
  speed: 1,
  eqPreset: 'flat',
  eqGains: EQ_PRESETS[0].gains
}

/** Whether closing the window keeps the player in the tray: the user's choice, else on everywhere but Linux, where a tray icon is not guaranteed. */
export function closeToTrayOn(setting: boolean | null, platform: string): boolean {
  return setting ?? platform !== 'linux'
}

const QUALITIES: Quality[] = ['nq', 'hq', 'lossless']
const MOTIONS: MotionLevel[] = ['full', 'reduced', 'off']

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Takes whatever was stored (possibly from an older version, possibly damaged) and returns valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const bool = (key: keyof Settings, fallback: boolean): boolean =>
    typeof input[key] === 'boolean' ? (input[key] as boolean) : fallback

  const gains = Array.isArray(input.eqGains) ? input.eqGains : []
  const eqGains =
    gains.length === EQ_BANDS.length &&
    gains.every((gain) => typeof gain === 'number' && Number.isFinite(gain))
      ? (gains as number[]).map((gain) => clamp(gain, -EQ_LIMIT_DB, EQ_LIMIT_DB))
      : DEFAULT_SETTINGS.eqGains

  const speed = typeof input.speed === 'number' && Number.isFinite(input.speed) ? input.speed : 1

  return {
    quality: QUALITIES.includes(input.quality as Quality)
      ? (input.quality as Quality)
      : DEFAULT_SETTINGS.quality,
    motion: MOTIONS.includes(input.motion as MotionLevel)
      ? (input.motion as MotionLevel)
      : DEFAULT_SETTINGS.motion,
    visualizer: bool('visualizer', DEFAULT_SETTINGS.visualizer),
    dynamicColors: bool('dynamicColors', DEFAULT_SETTINGS.dynamicColors),
    sidebarCollapsed: bool('sidebarCollapsed', DEFAULT_SETTINGS.sidebarCollapsed),
    closeToTray: typeof input.closeToTray === 'boolean' ? input.closeToTray : null,
    discord: bool('discord', DEFAULT_SETTINGS.discord),
    sync: bool('sync', DEFAULT_SETTINGS.sync),
    prefetchNext: bool('prefetchNext', DEFAULT_SETTINGS.prefetchNext),
    speed: clamp(speed, 0.5, 3),
    eqPreset: typeof input.eqPreset === 'string' ? input.eqPreset : DEFAULT_SETTINGS.eqPreset,
    eqGains
  }
}
