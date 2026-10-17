// In development macOS names the app after the stock Electron.app in node_modules ("Electron" in the menu bar,
// Cmd+Tab and Activity Monitor). Packaged builds already use productName from electron-builder.yml.
// This runs before `npm run dev` and rebrands that bundle: name and icon. It is safe to run repeatedly.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, utimesSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NAME = 'trashee'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = join(root, 'node_modules', 'electron', 'dist', 'Electron.app')
const plist = join(bundle, 'Contents', 'Info.plist')
const icon = join(root, 'build', 'icon.icns')

if (process.platform === 'darwin' && existsSync(plist)) {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    execFileSync('plutil', ['-replace', key, '-string', NAME, plist])
  }
  if (existsSync(icon)) {
    copyFileSync(icon, join(bundle, 'Contents', 'Resources', 'electron.icns'))
  }
  // Nudges Launch Services to notice the new name and icon.
  const now = new Date()
  utimesSync(bundle, now, now)
}
