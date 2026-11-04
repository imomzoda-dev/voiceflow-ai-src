/**
 * API keys are encrypted with Electron safeStorage:
 *  - Windows: DPAPI (bound to the current Windows user)
 *  - macOS: AES key held in the login Keychain ("VoiceFlow AI Safe Storage")
 * The encrypted blob lives in userData/secrets.bin. Nothing is ever written in plain text;
 * if OS encryption is unavailable, saving a key fails loudly instead of degrading silently.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { createLogger } from '../main/logger'

const log = createLogger('secrets')

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(enc: Buffer): string
}

export class SecretsService {
  private cache: Record<string, string> | null = null

  constructor(
    private readonly file: string,
    private readonly storage: SafeStorageLike
  ) {}

  available(): boolean {
    try {
      return this.storage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  private load(): Record<string, string> {
    if (this.cache) return this.cache
    if (!existsSync(this.file)) return (this.cache = {})
    try {
      const plain = this.storage.decryptString(readFileSync(this.file))
      this.cache = JSON.parse(plain) as Record<string, string>
    } catch (e) {
      log.error('Could not decrypt secret store; keys must be re-entered', e)
      this.cache = {}
    }
    return this.cache
  }

  private persist() {
    if (!this.available()) throw new Error('OS secure storage is not available on this system')
    const enc = this.storage.encryptString(JSON.stringify(this.cache ?? {}))
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, enc, { mode: 0o600 })
    renameSync(tmp, this.file)
  }

  get(id: string): string | null {
    return this.load()[id] ?? null
  }

  has(id: string): boolean {
    return Boolean(this.load()[id])
  }

  set(id: string, value: string) {
    this.load()[id] = value
    this.persist()
  }

  delete(id: string) {
    const all = this.load()
    if (id in all) {
      delete all[id]
      this.persist()
    }
  }

  clear() {
    this.cache = {}
    if (existsSync(this.file)) this.persist()
  }
}
