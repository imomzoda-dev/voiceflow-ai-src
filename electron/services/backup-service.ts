/**
 * Backups: a gzip-compressed JSON bundle (*.vfbackup) with documents, versions, folders,
 * dictionary, templates, settings, provider definitions (WITHOUT keys) and optionally history.
 * API keys are never exported — they stay in the OS secret store.
 */
import { gzipSync, gunzipSync } from 'node:zlib'
import { readFile, writeFile, stat, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DatabaseHandle } from '../db/client'
import type { BackupsRepository } from '../db/misc-repos'
import type { BackupInfo } from '../../shared/types'
import { createLogger } from '../main/logger'

const log = createLogger('backup')

export const BACKUP_FORMAT = 'voiceflow-backup'
export const BACKUP_VERSION = 1

const TABLES = ['document_folders', 'documents', 'document_versions', 'personal_dictionary', 'templates', 'app_settings', 'ai_providers', 'dictations'] as const
type TableName = (typeof TABLES)[number]

export interface BackupBundle {
  format: typeof BACKUP_FORMAT
  version: number
  createdAt: number
  app: string
  tables: Partial<Record<TableName, Record<string, unknown>[]>>
}

export class BackupService {
  constructor(
    private readonly h: DatabaseHandle,
    private readonly repo: BackupsRepository,
    private readonly appVersion: string
  ) {}

  private dump(): BackupBundle {
    const tables: BackupBundle['tables'] = {}
    for (const t of TABLES) {
      const rows = this.h.raw.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[]
      // Audio file paths are machine-specific and audio isn't included.
      tables[t] = t === 'dictations' ? rows.map((r) => ({ ...r, audio_path: null })) : rows
    }
    return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: Date.now(), app: this.appVersion, tables }
  }

  async createAt(filePath: string, kind: BackupInfo['kind']): Promise<BackupInfo> {
    const info: BackupInfo = { id: randomUUID(), createdAt: Date.now(), path: filePath, sizeBytes: 0, kind, status: 'ok', message: null }
    try {
      const data = gzipSync(Buffer.from(JSON.stringify(this.dump()), 'utf8'))
      await writeFile(filePath, data)
      info.sizeBytes = (await stat(filePath)).size
      log.info('Backup created', { kind, size: info.sizeBytes })
    } catch (e) {
      info.status = 'error'
      info.message = (e as Error).message
      log.error('Backup failed', e)
    }
    await this.repo.add(info)
    return info
  }

  static parse(buf: Buffer): BackupBundle {
    let json: unknown
    try {
      json = JSON.parse(gunzipSync(buf).toString('utf8'))
    } catch {
      throw new Error('This file is not a VoiceFlow AI backup')
    }
    const b = json as BackupBundle
    if (b?.format !== BACKUP_FORMAT || typeof b.version !== 'number' || typeof b.tables !== 'object') throw new Error('This file is not a VoiceFlow AI backup')
    if (b.version > BACKUP_VERSION) throw new Error('This backup was made by a newer version of VoiceFlow AI')
    return b
  }

  /** Restores by upserting rows (existing items with the same id are replaced; others are kept). */
  async restoreFrom(filePath: string): Promise<Record<string, number>> {
    const bundle = BackupService.parse(await readFile(filePath))
    const counts: Record<string, number> = {}
    await this.h.transaction(async () => {
      for (const t of TABLES) {
        const rows = bundle.tables[t]
        if (!Array.isArray(rows)) continue
        const cols = new Set((this.h.raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name))
        let n = 0
        for (const row of rows) {
          const keys = Object.keys(row).filter((k) => cols.has(k))
          if (!keys.length) continue
          const sql = `INSERT OR REPLACE INTO ${t} (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`
          const values = keys.map((k) => {
            const v = row[k]
            return v === undefined ? null : (v as string | number | null)
          })
          this.h.raw.prepare(sql).run(...values)
          n++
        }
        counts[t] = n
      }
    })
    log.info('Backup restored', counts)
    return counts
  }

  async prune(dir: string, keep: number) {
    try {
      const files = (await readdir(dir)).filter((f) => f.startsWith('voiceflow-auto-') && f.endsWith('.vfbackup')).sort()
      for (const f of files.slice(0, Math.max(0, files.length - keep))) await rm(join(dir, f), { force: true })
    } catch (e) {
      log.warn('Backup pruning failed', e)
    }
  }
}
