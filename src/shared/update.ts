/** Everything about updates that does not need Electron: versions, which file to download, state shapes. */

export interface Version {
  major: number
  minor: number
  patch: number
  /** Dot-separated identifiers after the dash, e.g. "beta.2"; empty for a final release. */
  pre: string[]
}

export function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(text.trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split('.') : []
  }
}

function comparePre(a: string[], b: string[]): number {
  // A final release is newer than any pre-release of the same number.
  if (a.length === 0 || b.length === 0) return a.length === b.length ? 0 : a.length === 0 ? 1 : -1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1
    if (b[i] === undefined) return 1
    const numeric = /^\d+$/.test(a[i]) && /^\d+$/.test(b[i])
    const diff = numeric ? Number(a[i]) - Number(b[i]) : a[i].localeCompare(b[i])
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/** Negative when a is older than b, positive when newer; null when either is not a version. */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return null
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  return comparePre(left.pre, right.pre)
}

export const isNewer = (candidate: string, current: string): boolean =>
  (compareVersions(candidate, current) ?? 0) > 0

export interface ReleaseAsset {
  name: string
  size: number
  url: string
}

/**
 * The installer for this system, or null when the release has none for it.
 * Names follow electron-builder.yml: "...-mac-arm64.dmg", "...-win-setup.exe", "...-linux-x86_64.AppImage".
 */
export function pickAsset(
  assets: ReleaseAsset[],
  platform: string,
  arch: string
): ReleaseAsset | null {
  const find = (pattern: RegExp): ReleaseAsset | null =>
    assets.find((asset) => pattern.test(asset.name)) ?? null
  if (platform === 'darwin') return find(arch === 'arm64' ? /mac-arm64\.dmg$/ : /mac-x64\.dmg$/)
  if (platform === 'win32') return arch === 'x64' ? find(/win-setup\.exe$/) : null
  if (platform === 'linux') return arch === 'x64' ? find(/\.AppImage$/) : null
  return null
}

/** The zip of the macOS app, which can replace the installed copy without a drag in the Finder. */
export function pickMacZip(assets: ReleaseAsset[], arch: string): ReleaseAsset | null {
  const pattern = arch === 'arm64' ? /mac-arm64\.zip$/ : /mac-x64\.zip$/
  return assets.find((asset) => pattern.test(asset.name)) ?? null
}

/** Reads the output of `sha256sum`: "<hex>  <name>" or "<hex> *<name>". Names are lowercase-keyed by exact text. */
export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line)
    if (match) sums.set(match[2], match[1].toLowerCase())
  }
  return sums
}

/** Release notes are Markdown; the dialog shows them as plain lines. */
export function plainNotes(markdown: string, limit = 1500): string {
  const text = markdown
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text
}

export interface AppInfo {
  version: string
  commit: string
  builtAt: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  packaged: boolean
}

export interface UpdateInfo {
  version: string
  notes: string
  publishedAt: string
  pageUrl: string
  /** Size of the installer; 0 when this system has none. */
  size: number
  /** False when the release has no installer for this system, so only its page can be opened. */
  canInstall: boolean
  /** True when the app can replace itself and start again; false when the user has to open the file. */
  restart: boolean
}

export type UpdateStatus =
  'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'

export interface UpdateState {
  status: UpdateStatus
  /** Whether the dialog should be on screen. */
  prompt: boolean
  info: UpdateInfo | null
  received: number
  total: number
  /** Where the downloaded installer is, once it is. */
  file: string | null
  error: string | null
  /** Check on every start. */
  auto: boolean
  checkedAt: number | null
}

export const INITIAL_UPDATE_STATE: UpdateState = {
  status: 'idle',
  prompt: false,
  info: null,
  received: 0,
  total: 0,
  file: null,
  error: null,
  auto: true,
  checkedAt: null
}

export interface UpdatePrefs {
  auto: boolean
  skipped: string | null
  remindAfter: number
}

export const DEFAULT_UPDATE_PREFS: UpdatePrefs = { auto: true, skipped: null, remindAfter: 0 }

export const REMIND_LATER_MS = 24 * 60 * 60 * 1000

export function sanitizeUpdatePrefs(raw: unknown): UpdatePrefs {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    auto: typeof input.auto === 'boolean' ? input.auto : DEFAULT_UPDATE_PREFS.auto,
    skipped:
      typeof input.skipped === 'string' && parseVersion(input.skipped) ? input.skipped : null,
    remindAfter:
      typeof input.remindAfter === 'number' && Number.isFinite(input.remindAfter)
        ? input.remindAfter
        : 0
  }
}

/** Whether a version found at startup should interrupt the user: not skipped, and not snoozed. */
export function shouldPrompt(version: string, prefs: UpdatePrefs, now: number): boolean {
  if (prefs.skipped === version) return false
  return now >= prefs.remindAfter
}
