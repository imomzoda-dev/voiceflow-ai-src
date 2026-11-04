import { and, desc, eq, gte, lte, sql, count, isNotNull, lt } from 'drizzle-orm'
import { dictations } from '../../database/schema'
import type { DatabaseHandle } from './client'
import type { DashboardStats, DictationRecord, HistoryQuery } from '../../shared/types'

type Row = typeof dictations.$inferSelect
export type NewDictation = typeof dictations.$inferInsert

function toRecord(r: Row): DictationRecord {
  return {
    id: r.id,
    startedAt: r.startedAt,
    durationMs: r.durationMs,
    language: r.language,
    speechProvider: r.speechProvider,
    speechModel: r.speechModel,
    mode: r.mode as DictationRecord['mode'],
    originalText: r.originalText,
    correctedText: r.correctedText,
    finalText: r.finalText,
    status: r.status as DictationRecord['status'],
    error: r.error,
    target: r.target,
    wordCount: r.wordCount,
    hasAudio: Boolean(r.audioPath),
    documentId: r.documentId
  }
}

export class DictationsRepository {
  constructor(private readonly h: DatabaseHandle) {}
  private get db() {
    return this.h.db
  }

  async insert(row: NewDictation) {
    await this.db.insert(dictations).values(row)
  }

  async update(id: string, patch: Partial<NewDictation>) {
    await this.db.update(dictations).set(patch).where(eq(dictations.id, id))
  }

  async get(id: string): Promise<(DictationRecord & { audioPath: string | null }) | null> {
    const [r] = await this.db.select().from(dictations).where(eq(dictations.id, id)).limit(1)
    return r ? { ...toRecord(r), audioPath: r.audioPath } : null
  }

  async latestSuccessful(): Promise<DictationRecord | null> {
    const [r] = await this.db
      .select()
      .from(dictations)
      .where(eq(dictations.status, 'success'))
      .orderBy(desc(dictations.startedAt))
      .limit(1)
    return r ? toRecord(r) : null
  }

  async list(q: HistoryQuery = {}): Promise<{ items: DictationRecord[]; total: number }> {
    const conds = []
    if (q.search?.trim()) {
      const term = `%${q.search.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`
      conds.push(
        sql`(${dictations.finalText} LIKE ${term} ESCAPE '\\' OR ${dictations.originalText} LIKE ${term} ESCAPE '\\' OR ${dictations.correctedText} LIKE ${term} ESCAPE '\\')`
      )
    }
    if (q.language) conds.push(eq(dictations.language, q.language))
    if (q.status) conds.push(eq(dictations.status, q.status))
    if (q.from) conds.push(gte(dictations.startedAt, q.from))
    if (q.to) conds.push(lte(dictations.startedAt, q.to))
    const where = conds.length ? and(...conds) : undefined
    const [{ n }] = await this.db.select({ n: count() }).from(dictations).where(where)
    const rows = await this.db
      .select()
      .from(dictations)
      .where(where)
      .orderBy(desc(dictations.startedAt))
      .limit(Math.min(q.limit ?? 100, 1000))
      .offset(q.offset ?? 0)
    return { items: rows.map(toRecord), total: n }
  }

  async all(): Promise<DictationRecord[]> {
    const rows = await this.db.select().from(dictations).orderBy(desc(dictations.startedAt))
    return rows.map(toRecord)
  }

  async remove(id: string): Promise<string | null> {
    const [r] = await this.db.select({ audioPath: dictations.audioPath }).from(dictations).where(eq(dictations.id, id))
    await this.db.delete(dictations).where(eq(dictations.id, id))
    return r?.audioPath ?? null
  }

  async clear(): Promise<{ count: number; audioPaths: string[] }> {
    const rows = await this.db.select({ id: dictations.id, audioPath: dictations.audioPath }).from(dictations)
    await this.db.delete(dictations)
    return { count: rows.length, audioPaths: rows.map((r) => r.audioPath).filter((p): p is string => !!p) }
  }

  async audioPaths(olderThan?: number): Promise<{ id: string; audioPath: string }[]> {
    const conds = [isNotNull(dictations.audioPath)]
    if (olderThan) conds.push(lt(dictations.startedAt, olderThan))
    const rows = await this.db.select({ id: dictations.id, audioPath: dictations.audioPath }).from(dictations).where(and(...conds))
    return rows.filter((r): r is { id: string; audioPath: string } => !!r.audioPath)
  }

  async clearAudioRefs(ids: string[]) {
    for (const id of ids) await this.db.update(dictations).set({ audioPath: null }).where(eq(dictations.id, id))
  }

  async pruneOlderThan(ts: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: dictations.id, audioPath: dictations.audioPath })
      .from(dictations)
      .where(lt(dictations.startedAt, ts))
    if (rows.length) await this.db.delete(dictations).where(lt(dictations.startedAt, ts))
    return rows.map((r) => r.audioPath).filter((p): p is string => !!p)
  }

  /** All numbers come from real rows; nothing is synthesised. */
  async stats(documentsCount: number, now = Date.now()): Promise<DashboardStats> {
    const ok = eq(dictations.status, 'success')
    const [tot] = await this.db
      .select({
        words: sql<number>`coalesce(sum(${dictations.wordCount}), 0)`,
        n: count(),
        dur: sql<number>`coalesce(sum(${dictations.durationMs}), 0)`
      })
      .from(dictations)
      .where(ok)
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const dayStart = startOfDay.getTime()
    const weekStart = dayStart - 6 * 86400000
    const [today] = await this.db
      .select({ words: sql<number>`coalesce(sum(${dictations.wordCount}), 0)` })
      .from(dictations)
      .where(and(ok, gte(dictations.startedAt, dayStart)))
    const [week] = await this.db
      .select({ words: sql<number>`coalesce(sum(${dictations.wordCount}), 0)` })
      .from(dictations)
      .where(and(ok, gte(dictations.startedAt, weekStart)))
    const langs = await this.db
      .select({ language: dictations.language, count: count() })
      .from(dictations)
      .where(and(ok, isNotNull(dictations.language)))
      .groupBy(dictations.language)
      .orderBy(desc(count()))
      .limit(6)
    const recent = await this.db
      .select({ startedAt: dictations.startedAt, words: dictations.wordCount })
      .from(dictations)
      .where(and(ok, gte(dictations.startedAt, weekStart)))
    const daily: { day: string; words: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(dayStart - i * 86400000)
      daily.push({ day: d.toISOString().slice(0, 10), words: 0 })
    }
    for (const r of recent) {
      const d = new Date(r.startedAt)
      d.setHours(0, 0, 0, 0)
      const idx = Math.round((d.getTime() - (dayStart - 6 * 86400000)) / 86400000)
      if (idx >= 0 && idx < 7) daily[idx].words += r.words
    }
    return {
      totalWords: Number(tot?.words ?? 0),
      totalDictations: Number(tot?.n ?? 0),
      totalDurationMs: Number(tot?.dur ?? 0),
      wordsToday: Number(today?.words ?? 0),
      wordsThisWeek: Number(week?.words ?? 0),
      documentsCount,
      languages: langs.map((l) => ({ language: l.language ?? '?', count: l.count })),
      daily
    }
  }
}
