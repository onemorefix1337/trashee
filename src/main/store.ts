import { app, safeStorage } from 'electron'
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const tokenFile = (): string => join(app.getPath('userData'), 'token.bin')

export function saveToken(token: string): void {
  const file = tokenFile()
  // Without an OS keychain (some Linux setups) the token stays in a user-only file.
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(token)
    : Buffer.from(token)
  writeFileSync(file, data)
  chmodSync(file, 0o600)
}

export function loadToken(): string | null {
  const file = tokenFile()
  if (!existsSync(file)) return null
  try {
    const data = readFileSync(file)
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString()
  } catch {
    return null
  }
}

export function clearToken(): void {
  rmSync(tokenFile(), { force: true })
}
