import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_UPDATE_PREFS,
  compareVersions,
  isNewer,
  parseChecksums,
  parseVersion,
  pickAsset,
  pickMacZip,
  plainNotes,
  sanitizeUpdatePrefs,
  shouldPrompt,
  type ReleaseAsset
} from './update.ts'

test('versions parse with or without the v, and reject nonsense', () => {
  assert.deepEqual(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3, pre: [] })
  assert.deepEqual(parseVersion('0.10.0-beta.2'), {
    major: 0,
    minor: 10,
    patch: 0,
    pre: ['beta', '2']
  })
  assert.equal(parseVersion('latest'), null)
  assert.equal(parseVersion('1.2'), null)
})

test('versions compare by number, not by text', () => {
  assert.equal(compareVersions('0.9.0', '0.10.0'), -1)
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1)
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('x', '1.0.0'), null)
})

test('a pre-release is older than its release, and betas order by number', () => {
  assert.equal(compareVersions('1.0.0-beta.1', '1.0.0'), -1)
  assert.equal(compareVersions('1.0.0-beta.2', '1.0.0-beta.10'), -1)
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0-beta.9'), 1)
})

test('only a strictly newer version counts as an update', () => {
  assert.equal(isNewer('0.2.0', '0.1.0'), true)
  assert.equal(isNewer('0.1.0', '0.1.0'), false)
  assert.equal(isNewer('0.0.9', '0.1.0'), false)
  assert.equal(isNewer('garbage', '0.1.0'), false)
})

const asset = (name: string): ReleaseAsset => ({ name, size: 1, url: `https://x/${name}` })
const assets = [
  'trashee-0.2.0-mac-arm64.dmg',
  'trashee-0.2.0-mac-arm64.zip',
  'trashee-0.2.0-mac-x64.zip',
  'trashee-0.2.0-mac-x64.dmg',
  'trashee-0.2.0-win-setup.exe',
  'trashee-0.2.0-linux-x86_64.AppImage',
  'trashee-0.2.0-linux-x64.tar.gz',
  'SHA256SUMS.txt'
].map(asset)

test('the installer matches the system and architecture', () => {
  assert.equal(pickAsset(assets, 'darwin', 'arm64')?.name, 'trashee-0.2.0-mac-arm64.dmg')
  assert.equal(pickAsset(assets, 'darwin', 'x64')?.name, 'trashee-0.2.0-mac-x64.dmg')
  assert.equal(pickAsset(assets, 'win32', 'x64')?.name, 'trashee-0.2.0-win-setup.exe')
  assert.equal(pickAsset(assets, 'linux', 'x64')?.name, 'trashee-0.2.0-linux-x86_64.AppImage')
})

test('the macOS zip matches the architecture', () => {
  assert.equal(pickMacZip(assets, 'arm64')?.name, 'trashee-0.2.0-mac-arm64.zip')
  assert.equal(pickMacZip(assets, 'x64')?.name, 'trashee-0.2.0-mac-x64.zip')
  assert.equal(pickMacZip([], 'arm64'), null)
})

test('no installer for systems the release was not built for', () => {
  assert.equal(pickAsset(assets, 'linux', 'arm64'), null)
  assert.equal(pickAsset(assets, 'win32', 'arm64'), null)
  assert.equal(pickAsset(assets, 'freebsd', 'x64'), null)
  assert.equal(pickAsset([], 'darwin', 'arm64'), null)
})

test('checksums are read from sha256sum output', () => {
  const hash = 'a'.repeat(64)
  const other = 'B'.repeat(64)
  const sums = parseChecksums(`${hash}  one.dmg\n${other} *two file.exe\nnot a line\n`)
  assert.equal(sums.get('one.dmg'), hash)
  assert.equal(sums.get('two file.exe'), 'b'.repeat(64))
  assert.equal(sums.size, 2)
})

test('release notes lose their Markdown and are cut to a limit', () => {
  const notes = plainNotes(
    '## Что нового\n- **Мини-плеер**\n- [Текст песен](https://x) из LRCLIB\n\n\n\nКонец'
  )
  assert.equal(notes, 'Что нового\n• Мини-плеер\n• Текст песен из LRCLIB\n\nКонец')
  assert.ok(plainNotes('a'.repeat(5000), 100).length <= 101)
})

test('damaged preferences fall back to defaults', () => {
  assert.deepEqual(sanitizeUpdatePrefs(null), DEFAULT_UPDATE_PREFS)
  assert.deepEqual(sanitizeUpdatePrefs({ auto: false, skipped: 'nope', remindAfter: 'x' }), {
    auto: false,
    skipped: null,
    remindAfter: 0
  })
})

test('a skipped version or a snooze keeps the dialog away, a newer version does not', () => {
  const prefs = { auto: true, skipped: '0.2.0', remindAfter: 1000 }
  assert.equal(shouldPrompt('0.2.0', prefs, 5000), false)
  assert.equal(shouldPrompt('0.3.0', prefs, 5000), true)
  assert.equal(shouldPrompt('0.3.0', prefs, 500), false)
  assert.equal(shouldPrompt('0.3.0', { ...prefs, remindAfter: 0 }, 500), true)
})
