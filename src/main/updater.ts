import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import {
  accessSync,
  chmodSync,
  constants as fsConstants,
  copyFileSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { basename, dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import {
  INITIAL_UPDATE_STATE,
  REMIND_LATER_MS,
  compareVersions,
  isNewer,
  parseChecksums,
  pickAsset,
  parseVersion,
  pickMacZip,
  plainNotes,
  sanitizeUpdatePrefs,
  shouldPrompt,
  type AppInfo,
  type ReleaseAsset,
  type UpdateInfo,
  type UpdatePrefs,
  type UpdateState
} from '../shared/update'

const REPO = 'onemorefix1337/trashee'
// A test can point the updater at its own server; nothing else reads this.
const API_OVERRIDE = process.env['TRASHEE_UPDATE_API']
// The list, not "latest": Android releases of this repository must never be taken for a desktop update.
const RELEASES_URL = API_OVERRIDE ?? `https://api.github.com/repos/${REPO}/releases?per_page=30`
const STARTUP_DELAY_MS = 4_000
const RECHECK_MS = 6 * 60 * 60 * 1000
const CHECK_TIMEOUT_MS = 10_000
const PROGRESS_INTERVAL_MS = 120
const CHECKSUMS = 'SHA256SUMS.txt'
// The dialog says what is about to happen before the window goes away.
const RESTART_DELAY_MS = 1200

const prefsFile = (): string => join(app.getPath('userData'), 'updates.json')

function loadPrefs(): UpdatePrefs {
  try {
    return sanitizeUpdatePrefs(JSON.parse(readFileSync(prefsFile(), 'utf8')))
  } catch {
    return sanitizeUpdatePrefs(null)
  }
}

let prefs: UpdatePrefs
let state: UpdateState = INITIAL_UPDATE_STATE
let release: { info: UpdateInfo; asset: ReleaseAsset | null; sums: ReleaseAsset | null } | null =
  null
let download: AbortController | null = null
let getPlayerWindow: () => BrowserWindow | null = () => null

function savePrefs(): void {
  try {
    writeFileSync(prefsFile(), JSON.stringify(prefs))
  } catch {
    /* a forgotten "skip" is not worth an error */
  }
}

function publish(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  const player = getPlayerWindow()
  if (player && !player.isDestroyed()) player.webContents.send('update:state', state)
}

const userAgent = (): string => `trashee/${app.getVersion()}`

/** Installers come from GitHub; only a test server set through the environment may be anywhere else. */
function trustedUrl(url: string): boolean {
  if (API_OVERRIDE) return /^https?:\/\//.test(url)
  try {
    const { protocol, hostname } = new URL(url)
    return (
      protocol === 'https:' &&
      (hostname === 'github.com' || hostname.endsWith('.githubusercontent.com'))
    )
  } catch {
    return false
  }
}

const errorText = (error: unknown): string =>
  error instanceof Error && error.name !== 'AbortError' && error.name !== 'TimeoutError'
    ? error.message
    : 'Нет связи с GitHub'

/** The .app folder this process runs from, when it is somewhere the app can replace itself. */
function macBundle(): string | null {
  if (!app.isPackaged) return null
  const bundle = resolve(app.getPath('exe'), '../../..')
  if (!bundle.endsWith('.app')) return null
  try {
    accessSync(dirname(bundle), fsConstants.W_OK)
    accessSync(bundle, fsConstants.W_OK)
    return bundle
  } catch {
    return null
  }
}

/** The AppImage file this process was started from, when it can be overwritten. */
function appImageFile(): string | null {
  const file = process.env['APPIMAGE']
  if (!file) return null
  try {
    accessSync(file, fsConstants.W_OK)
    accessSync(dirname(file), fsConstants.W_OK)
    return file
  } catch {
    return null
  }
}

/** Which file to fetch, and whether the app can install it by itself (restart: true) or only hand it over. */
function planInstall(assets: ReleaseAsset[]): { asset: ReleaseAsset | null; restart: boolean } {
  const installer = pickAsset(assets, process.platform, process.arch)
  if (process.platform === 'darwin') {
    const zip = pickMacZip(assets, process.arch)
    return zip && macBundle() ? { asset: zip, restart: true } : { asset: installer, restart: false }
  }
  if (process.platform === 'win32') return { asset: installer, restart: app.isPackaged }
  return { asset: installer, restart: installer !== null && appImageFile() !== null }
}

export function appInfo(): AppInfo {
  return {
    version: app.getVersion(),
    commit: typeof __BUILD_COMMIT__ === 'undefined' ? 'dev' : __BUILD_COMMIT__,
    builtAt: typeof __BUILD_TIME__ === 'undefined' ? '' : __BUILD_TIME__,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged
  }
}

/** Looks for a newer release. A manual check always shows its result; a background one stays quiet. */
export async function checkForUpdates(manual: boolean): Promise<void> {
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') {
    if (manual && state.info) publish({ prompt: true })
    return
  }
  const before = state.status
  publish({ status: 'checking', error: null })
  try {
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': userAgent() },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error(`GitHub ответил ${response.status}`)
    const listed = (await response.json()) as Record<string, unknown>[]
    // Desktop releases are tagged v1.2.3; "android-v1.2.3" and drafts are not for us.
    const body = (Array.isArray(listed) ? listed : [listed])
      .filter(
        (release) =>
          release.draft !== true &&
          release.prerelease !== true &&
          parseVersion(String(release.tag_name ?? '')) !== null
      )
      .sort((a, b) => compareVersions(String(b.tag_name), String(a.tag_name)) ?? 0)[0]
    const checkedAt = Date.now()
    const tag = String(body?.tag_name ?? '')
    if (!body) {
      release = null
      publish({ status: 'none', info: null, prompt: false, checkedAt })
      return
    }

    if (!isNewer(tag, app.getVersion())) {
      release = null
      publish({ status: 'none', info: null, prompt: false, checkedAt })
      return
    }

    const assets: ReleaseAsset[] = (Array.isArray(body.assets) ? body.assets : []).map(
      (asset: Record<string, unknown>) => ({
        name: String(asset.name ?? ''),
        size: Number(asset.size) || 0,
        url: String(asset.browser_download_url ?? '')
      })
    )
    const { asset, restart } = planInstall(assets)
    const sums = assets.find((candidate) => candidate.name === CHECKSUMS) ?? null
    const version = tag.replace(/^v/i, '')
    const pageUrl = String(body.html_url ?? '')
    const info: UpdateInfo = {
      version,
      notes: plainNotes(String(body.body ?? '')),
      publishedAt: String(body.published_at ?? ''),
      pageUrl: trustedUrl(pageUrl) ? pageUrl : `https://github.com/${REPO}/releases/latest`,
      size: asset?.size ?? 0,
      canInstall: asset !== null && trustedUrl(asset.url),
      restart: asset !== null && restart
    }
    release = { info, asset, sums }
    publish({
      status: 'available',
      info,
      prompt: manual || (prefs.auto && shouldPrompt(version, prefs, Date.now())),
      received: 0,
      total: 0,
      file: null,
      checkedAt
    })
  } catch (error) {
    if (manual) publish({ status: 'error', error: errorText(error), info: null, prompt: false })
    else publish({ status: before === 'error' ? 'idle' : before })
  }
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}

async function fetchTo(
  url: string,
  file: string,
  signal: AbortSignal,
  size: number
): Promise<void> {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent() }, signal })
  if (!response.ok || !response.body) throw new Error(`Сервер ответил ${response.status}`)
  const total = Number(response.headers.get('content-length')) || size
  let received = 0
  let lastReport = 0
  publish({ received: 0, total })

  const source = Readable.fromWeb(response.body as unknown as WebReadableStream)
  source.on('data', (chunk: Buffer) => {
    received += chunk.length
    const now = Date.now()
    if (now - lastReport >= PROGRESS_INTERVAL_MS) {
      lastReport = now
      publish({ received })
    }
  })
  const partial = `${file}.part`
  try {
    await pipeline(source, createWriteStream(partial), { signal })
    publish({ received: total })
    renameSync(partial, file)
  } catch (error) {
    rmSync(partial, { force: true })
    throw error
  }
}

/** Windows and macOS keep the installer out of the way; on Linux the AppImage is the app, so it goes to Downloads. */
const downloadDir = (): string =>
  process.platform === 'linux'
    ? app.getPath('downloads')
    : join(app.getPath('temp'), 'trashee-update')

const run = (command: string, args: string[]): Promise<void> =>
  new Promise((done, fail) => execFile(command, args, (error) => (error ? fail(error) : done())))

// Waits for this app to quit, swaps the folder (and puts the old one back if the swap fails), starts the new one.
const MAC_SWAP = `
while kill -0 "$1" 2>/dev/null; do sleep 0.3; done
OLD="$2.old.$$"
if mv "$2" "$OLD"; then
  if mv "$3" "$2"; then rm -rf "$OLD"; else mv "$OLD" "$2"; fi
fi
rm -rf "$4"
xattr -cr "$2" 2>/dev/null
open "$2"
`

/** Installs the downloaded update over the running app and starts it again. The caller quits afterwards. */
async function applyAndRestart(file: string): Promise<void> {
  if (process.platform === 'darwin') {
    const bundle = macBundle()
    if (!bundle) throw new Error('Нельзя заменить приложение в этой папке')
    const stage = join(dirname(bundle), '.trashee-update')
    rmSync(stage, { recursive: true, force: true })
    mkdirSync(stage, { recursive: true })
    await run('/usr/bin/ditto', ['-x', '-k', file, stage])
    const fresh = readdirSync(stage).find((name) => name.endsWith('.app'))
    if (!fresh) throw new Error('В архиве нет приложения')
    rmSync(file, { force: true })
    spawn(
      '/bin/sh',
      ['-c', MAC_SWAP, 'sh', String(process.pid), bundle, join(stage, fresh), stage],
      {
        detached: true,
        stdio: 'ignore'
      }
    ).unref()
  } else if (process.platform === 'win32') {
    // Silent install over the old one; "--force-run" opens the app again when it is done.
    spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
  } else {
    const target = appImageFile()
    if (!target) throw new Error('Нельзя заменить AppImage в этой папке')
    const staged = `${target}.update`
    copyFileSync(file, staged)
    chmodSync(staged, 0o755)
    renameSync(staged, target)
    rmSync(file, { force: true })
    app.relaunch({ execPath: target })
  }
  setTimeout(() => app.quit(), RESTART_DELAY_MS)
}

async function launch(file: string): Promise<void> {
  if (process.platform === 'linux') {
    chmodSync(file, 0o755)
    shell.showItemInFolder(file)
    return
  }
  const problem = await shell.openPath(file)
  if (problem) throw new Error(`Не удалось открыть установщик: ${problem}`)
}

export async function installUpdate(): Promise<void> {
  const current = release
  if (!current || state.status === 'downloading') return
  if (!current.asset || !current.info.canInstall) {
    void shell.openExternal(current.info.pageUrl)
    return
  }
  const { asset, sums } = current
  const controller = new AbortController()
  download = controller
  publish({ status: 'downloading', prompt: true, received: 0, total: asset.size, error: null })

  try {
    const dir = downloadDir()
    mkdirSync(dir, { recursive: true })
    const file = join(dir, basename(asset.name))
    await fetchTo(asset.url, file, controller.signal, asset.size)

    if (sums) {
      const listed = await fetch(sums.url, {
        headers: { 'User-Agent': userAgent() },
        signal: controller.signal
      })
      if (!listed.ok) throw new Error('Не удалось получить контрольные суммы')
      const expected = parseChecksums(await listed.text()).get(asset.name)
      if (!expected) throw new Error('Для файла нет контрольной суммы')
      if ((await sha256(file)) !== expected) {
        rmSync(file, { force: true })
        throw new Error('Контрольная сумма не совпала: файл повреждён')
      }
    }

    publish({ status: 'ready', file })
    if (current.info.restart) await applyAndRestart(file)
    else await launch(file)
  } catch (error) {
    if (controller.signal.aborted) {
      publish({ status: 'available', received: 0, total: 0, error: null })
    } else {
      publish({ status: 'error', error: errorText(error), prompt: true })
    }
  } finally {
    download = null
  }
}

export function registerUpdater(playerWindow: () => BrowserWindow | null): void {
  getPlayerWindow = playerWindow
  prefs = loadPrefs()
  state = { ...INITIAL_UPDATE_STATE, auto: prefs.auto }

  const fromPlayer = (sender: Electron.WebContents): boolean => {
    const player = getPlayerWindow()
    return !!player && !player.isDestroyed() && sender === player.webContents
  }
  const handle = (channel: string, run: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args) =>
      fromPlayer(event.sender) ? run(...args) : undefined
    )
  }

  handle('app:info', () => appInfo())
  handle('update:get', () => state)
  handle('update:check', () => checkForUpdates(true))
  handle('update:install', () => installUpdate())
  handle('update:cancel', () => download?.abort())
  handle('update:show', () => {
    if (state.info) publish({ prompt: true })
  })
  // "Later" hides the dialog now and keeps it away for a day; the next start asks again.
  handle('update:later', () => {
    prefs = { ...prefs, remindAfter: Date.now() + REMIND_LATER_MS }
    savePrefs()
    publish({ prompt: false })
  })
  handle('update:skip', () => {
    if (state.info) {
      prefs = { ...prefs, skipped: state.info.version }
      savePrefs()
    }
    publish({ prompt: false })
  })
  handle('update:dismiss', () => publish({ prompt: false }))
  handle('update:set-auto', (value) => {
    prefs = { ...prefs, auto: value === true }
    savePrefs()
    publish({ auto: prefs.auto })
  })
  handle('update:open-page', () => {
    if (state.info) void shell.openExternal(state.info.pageUrl)
  })
  handle('update:reveal', () => {
    if (state.file) shell.showItemInFolder(state.file)
  })
  handle('update:open-file', () => {
    if (state.file) void shell.openPath(state.file)
  })
  handle('update:quit', () => app.quit())

  const background = (): void => {
    if (prefs.auto) void checkForUpdates(false)
  }
  setTimeout(background, STARTUP_DELAY_MS)
  setInterval(background, RECHECK_MS).unref()
}
