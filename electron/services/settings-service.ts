import { EventEmitter } from 'node:events'
import { mergeSettings, sectionSchemas, type AppSettings, type SettingsSection } from '../../shared/settings'
import type { SettingsRepository } from '../db/misc-repos'

/** In-memory settings backed by the app_settings table (one row per section). */
export class SettingsService extends EventEmitter {
  private current!: AppSettings

  constructor(
    private readonly repo: SettingsRepository,
    private readonly platform: NodeJS.Platform = process.platform
  ) {
    super()
  }

  async load(): Promise<AppSettings> {
    const stored = await this.repo.getAll()
    this.current = mergeSettings(stored)
    // MacBook function keys need Fn, so a fresh macOS install defaults to holding Right Option.
    if (this.platform === 'darwin' && !stored.voice) {
      this.current = { ...this.current, voice: { ...this.current.voice, hotkeys: { ...this.current.voice.hotkeys, dictate: { keycode: 3640, ctrl: false, shift: false, alt: false, meta: false } } } }
    }
    return this.current
  }

  get(): AppSettings {
    return this.current
  }

  async update<K extends SettingsSection>(section: K, patch: Partial<AppSettings[K]>): Promise<AppSettings> {
    const schema = sectionSchemas[section]
    const merged = schema.parse({ ...this.current[section], ...patch }) as AppSettings[K]
    const prev = this.current
    this.current = { ...this.current, [section]: merged }
    await this.repo.set(section, merged)
    this.emit('change', this.current, prev, section)
    return this.current
  }

  async replaceAll(next: unknown): Promise<AppSettings> {
    const prev = this.current
    this.current = mergeSettings(next)
    for (const key of Object.keys(sectionSchemas) as SettingsSection[]) await this.repo.set(key, this.current[key])
    this.emit('change', this.current, prev, null)
    return this.current
  }
}
