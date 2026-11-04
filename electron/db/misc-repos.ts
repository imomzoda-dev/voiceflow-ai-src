import { asc, desc, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { aiProviders, appSettings, backupHistory, personalDictionary, speechModels, templates } from '../../database/schema'
import type { DatabaseHandle } from './client'
import type { BackupInfo, DictionaryEntry, Template } from '../../shared/types'
import { BUILTIN_TEMPLATES } from './builtin-templates'

/* ------------------------------- Dictionary ------------------------------- */

export class DictionaryRepository {
  constructor(private readonly h: DatabaseHandle) {}

  async list(): Promise<DictionaryEntry[]> {
    const rows = await this.h.db.select().from(personalDictionary).orderBy(asc(sql`lower(${personalDictionary.preferred})`))
    return rows.map((r) => ({ id: r.id, original: r.original, preferred: r.preferred, language: r.language, alias: r.alias, category: r.category }))
  }

  async upsert(e: Omit<DictionaryEntry, 'id'> & { id?: string }): Promise<DictionaryEntry> {
    const entry: DictionaryEntry = {
      id: e.id ?? randomUUID(),
      original: e.original.trim(),
      preferred: e.preferred.trim(),
      language: e.language || null,
      alias: e.alias?.trim() || null,
      category: e.category || 'term'
    }
    if (e.id) {
      await this.h.db.update(personalDictionary).set({ ...entry }).where(eq(personalDictionary.id, e.id))
    } else {
      await this.h.db.insert(personalDictionary).values({ ...entry, createdAt: Date.now() })
    }
    return entry
  }

  async remove(id: string) {
    await this.h.db.delete(personalDictionary).where(eq(personalDictionary.id, id))
  }
}

/* -------------------------------- Templates -------------------------------- */

export class TemplatesRepository {
  constructor(private readonly h: DatabaseHandle) {}

  /** Inserts built-in templates that are missing (by id); never overwrites user edits. */
  async seedBuiltins() {
    const existing = new Set((await this.h.db.select({ id: templates.id }).from(templates)).map((r) => r.id))
    for (const t of BUILTIN_TEMPLATES) {
      if (existing.has(t.id)) continue
      await this.h.db.insert(templates).values({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        contentJson: JSON.stringify(t.content),
        isBuiltin: true,
        createdAt: Date.now()
      })
    }
  }

  async list(): Promise<Template[]> {
    const rows = await this.h.db.select().from(templates).orderBy(desc(templates.isBuiltin), asc(templates.name))
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      content: JSON.parse(r.contentJson),
      isBuiltin: r.isBuiltin,
      createdAt: r.createdAt
    }))
  }

  async create(t: { name: string; description: string; category: string; content: unknown }): Promise<Template> {
    const row = { id: randomUUID(), name: t.name.trim() || 'Template', description: t.description, category: t.category || 'custom', contentJson: JSON.stringify(t.content), isBuiltin: false, createdAt: Date.now() }
    await this.h.db.insert(templates).values(row)
    return { id: row.id, name: row.name, description: row.description, category: row.category, content: t.content, isBuiltin: false, createdAt: row.createdAt }
  }

  async update(id: string, t: { name?: string; description?: string; category?: string; content?: unknown }) {
    const set: Partial<typeof templates.$inferInsert> = {}
    if (t.name !== undefined) set.name = t.name
    if (t.description !== undefined) set.description = t.description
    if (t.category !== undefined) set.category = t.category
    if (t.content !== undefined) set.contentJson = JSON.stringify(t.content)
    if (Object.keys(set).length) await this.h.db.update(templates).set(set).where(eq(templates.id, id))
  }

  async remove(id: string) {
    await this.h.db.delete(templates).where(eq(templates.id, id))
  }
}

/* -------------------------------- Providers -------------------------------- */

export type ProviderRow = typeof aiProviders.$inferSelect

export class ProvidersRepository {
  constructor(private readonly h: DatabaseHandle) {}
  async list(): Promise<ProviderRow[]> {
    return this.h.db.select().from(aiProviders).orderBy(asc(aiProviders.createdAt))
  }
  async get(id: string): Promise<ProviderRow | null> {
    const [r] = await this.h.db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1)
    return r ?? null
  }
  async insert(r: ProviderRow) {
    await this.h.db.insert(aiProviders).values(r)
  }
  async update(id: string, patch: Partial<ProviderRow>) {
    await this.h.db.update(aiProviders).set(patch).where(eq(aiProviders.id, id))
  }
  async remove(id: string) {
    await this.h.db.delete(aiProviders).where(eq(aiProviders.id, id))
  }
}

/* ---------------------------------- Settings ---------------------------------- */

export class SettingsRepository {
  constructor(private readonly h: DatabaseHandle) {}
  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.h.db.select().from(appSettings)
    const out: Record<string, unknown> = {}
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.valueJson)
      } catch {
        /* skip corrupt row */
      }
    }
    return out
  }
  async set(key: string, value: unknown) {
    const valueJson = JSON.stringify(value)
    await this.h.db
      .insert(appSettings)
      .values({ key, valueJson, updatedAt: Date.now() })
      .onConflictDoUpdate({ target: appSettings.key, set: { valueJson, updatedAt: Date.now() } })
  }
}

/* -------------------------------- Speech models -------------------------------- */

export type SpeechModelRow = typeof speechModels.$inferSelect

export class SpeechModelsRepository {
  constructor(private readonly h: DatabaseHandle) {}
  async list(): Promise<SpeechModelRow[]> {
    return this.h.db.select().from(speechModels)
  }
  async upsert(r: SpeechModelRow) {
    await this.h.db
      .insert(speechModels)
      .values(r)
      .onConflictDoUpdate({ target: speechModels.id, set: { path: r.path, sizeBytes: r.sizeBytes, sha256: r.sha256, verified: r.verified, installedAt: r.installedAt } })
  }
  async remove(id: string) {
    await this.h.db.delete(speechModels).where(eq(speechModels.id, id))
  }
}

/* ---------------------------------- Backups ---------------------------------- */

export class BackupsRepository {
  constructor(private readonly h: DatabaseHandle) {}
  async add(b: BackupInfo) {
    await this.h.db.insert(backupHistory).values(b)
  }
  async list(): Promise<BackupInfo[]> {
    const rows = await this.h.db.select().from(backupHistory).orderBy(desc(backupHistory.createdAt)).limit(100)
    return rows.map((r) => ({ ...r, kind: r.kind as BackupInfo['kind'], status: r.status as BackupInfo['status'] }))
  }
}
