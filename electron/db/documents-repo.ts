import { and, asc, desc, eq, isNotNull, isNull, like, or, sql, count } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { documents, documentFolders, documentVersions, templates } from '../../database/schema'
import type { DatabaseHandle } from './client'
import type { DocumentQuery, DocumentRecord, DocumentSummary, DocumentUpdate, DocumentVersion, Folder } from '../../shared/types'

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

/** Minimum interval between automatic version snapshots of the same document. */
export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000
export const MAX_VERSIONS_PER_DOC = 50

type DocRow = typeof documents.$inferSelect

function excerptOf(text: string, len = 180): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > len ? `${t.slice(0, len - 1)}…` : t
}

function toSummary(r: DocRow): DocumentSummary {
  return {
    id: r.id,
    title: r.title,
    folderId: r.folderId,
    excerpt: excerptOf(r.contentText.startsWith(r.title) ? r.contentText.slice(r.title.length) : r.contentText),
    wordCount: r.wordCount,
    isFavorite: r.isFavorite,
    deletedAt: r.deletedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastOpenedAt: r.lastOpenedAt
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return EMPTY_DOC
  }
}

function toRecord(r: DocRow): DocumentRecord {
  return { ...toSummary(r), content: safeParse(r.contentJson), contentText: r.contentText }
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’ʻ-][\p{L}\p{N}]+)*/gu)
  return m ? m.length : 0
}

export class DocumentsRepository {
  constructor(private readonly h: DatabaseHandle) {}

  private get db() {
    return this.h.db
  }

  async list(q: DocumentQuery = {}): Promise<DocumentSummary[]> {
    const conds = []
    const scope = q.scope ?? 'all'
    conds.push(scope === 'trash' ? isNotNull(documents.deletedAt) : isNull(documents.deletedAt))
    if (scope === 'favorites') conds.push(eq(documents.isFavorite, true))
    if (scope === 'recent') conds.push(isNotNull(documents.lastOpenedAt))
    if (q.folderId !== undefined && scope !== 'trash') {
      conds.push(q.folderId === null ? isNull(documents.folderId) : eq(documents.folderId, q.folderId))
    }
    if (q.search?.trim()) {
      const term = `%${q.search.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`
      conds.push(or(sql`${documents.title} LIKE ${term} ESCAPE '\\'`, sql`${documents.contentText} LIKE ${term} ESCAPE '\\'`))
    }
    const sort = q.sort ?? (scope === 'recent' ? 'opened' : 'updated')
    const order =
      sort === 'title'
        ? asc(sql`lower(${documents.title})`)
        : sort === 'created'
          ? desc(documents.createdAt)
          : sort === 'opened'
            ? desc(documents.lastOpenedAt)
            : desc(documents.updatedAt)
    const rows = await this.db
      .select()
      .from(documents)
      .where(and(...conds))
      .orderBy(order)
      .limit(Math.min(q.limit ?? 500, 2000))
    return rows.map(toSummary)
  }

  async get(id: string): Promise<DocumentRecord | null> {
    const [row] = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1)
    return row ? toRecord(row) : null
  }

  async create(input: { title?: string; folderId?: string | null; templateId?: string | null; content?: unknown; contentText?: string }): Promise<DocumentRecord> {
    let content: unknown = input.content ?? EMPTY_DOC
    let title = input.title?.trim() || 'Untitled document'
    if (input.templateId && !input.content) {
      const [tpl] = await this.db.select().from(templates).where(eq(templates.id, input.templateId)).limit(1)
      if (tpl) {
        content = safeParse(tpl.contentJson)
        if (!input.title) title = tpl.name
      }
    }
    const now = Date.now()
    const contentText = input.contentText ?? extractText(content)
    const row: DocRow = {
      id: randomUUID(),
      title,
      folderId: input.folderId ?? null,
      contentJson: JSON.stringify(content),
      contentText,
      wordCount: countWords(contentText),
      isFavorite: false,
      templateId: input.templateId ?? null,
      deletedAt: null,
      lastSnapshotAt: null,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    }
    await this.db.insert(documents).values(row)
    return toRecord(row)
  }

  /**
   * Autosave entry point. Also takes a throttled version snapshot of the PREVIOUS content
   * so history grows at most once per SNAPSHOT_INTERVAL_MS per document.
   */
  async update(id: string, patch: DocumentUpdate): Promise<{ updatedAt: number }> {
    const now = Date.now()
    return this.h.transaction(async () => {
      const [prev] = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1)
      if (!prev) throw new Error('Document not found')
      const values: Partial<DocRow> = { updatedAt: now }
      if (patch.title !== undefined) values.title = patch.title.trim() || 'Untitled document'
      if (patch.content !== undefined) {
        values.contentJson = JSON.stringify(patch.content)
        const text = patch.contentText ?? extractText(patch.content)
        values.contentText = text
        values.wordCount = patch.wordCount ?? countWords(text)
        const due = !prev.lastSnapshotAt || now - prev.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS
        if (due && prev.contentJson !== values.contentJson && prev.contentText.trim()) {
          await this.insertVersion(prev, 'auto', now)
          values.lastSnapshotAt = now
        }
      }
      await this.db.update(documents).set(values).where(eq(documents.id, id))
      return { updatedAt: now }
    })
  }

  private async insertVersion(doc: DocRow, reason: DocumentVersion['reason'], now: number): Promise<DocumentVersion> {
    const v = {
      id: randomUUID(),
      documentId: doc.id,
      contentJson: doc.contentJson,
      contentText: doc.contentText,
      wordCount: doc.wordCount,
      reason,
      createdAt: now
    }
    await this.db.insert(documentVersions).values(v)
    // Retention: keep the newest MAX_VERSIONS_PER_DOC.
    await this.db.run(sql`DELETE FROM document_versions WHERE document_id = ${doc.id} AND id NOT IN (
      SELECT id FROM document_versions WHERE document_id = ${doc.id} ORDER BY created_at DESC LIMIT ${MAX_VERSIONS_PER_DOC})`)
    return { id: v.id, documentId: v.documentId, reason, wordCount: v.wordCount, excerpt: excerptOf(v.contentText, 140), createdAt: now }
  }

  async snapshot(id: string, reason: DocumentVersion['reason']): Promise<DocumentVersion | null> {
    const [doc] = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1)
    if (!doc) return null
    const now = Date.now()
    const v = await this.insertVersion(doc, reason, now)
    await this.db.update(documents).set({ lastSnapshotAt: now }).where(eq(documents.id, id))
    return v
  }

  async versions(id: string): Promise<DocumentVersion[]> {
    const rows = await this.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.createdAt))
    return rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      reason: r.reason as DocumentVersion['reason'],
      wordCount: r.wordCount,
      excerpt: excerptOf(r.contentText, 140),
      createdAt: r.createdAt
    }))
  }

  async versionContent(versionId: string): Promise<{ content: unknown; contentText: string } | null> {
    const [v] = await this.db.select().from(documentVersions).where(eq(documentVersions.id, versionId)).limit(1)
    return v ? { content: safeParse(v.contentJson), contentText: v.contentText } : null
  }

  async restoreVersion(versionId: string): Promise<DocumentRecord | null> {
    const [v] = await this.db.select().from(documentVersions).where(eq(documentVersions.id, versionId)).limit(1)
    if (!v) return null
    const [doc] = await this.db.select().from(documents).where(eq(documents.id, v.documentId)).limit(1)
    if (!doc) return null
    const now = Date.now()
    await this.h.transaction(async () => {
      await this.insertVersion(doc, 'restore', now)
      await this.db
        .update(documents)
        .set({ contentJson: v.contentJson, contentText: v.contentText, wordCount: v.wordCount, updatedAt: now, lastSnapshotAt: now })
        .where(eq(documents.id, doc.id))
    })
    return this.get(doc.id)
  }

  async duplicate(id: string, copySuffix = ' (copy)'): Promise<DocumentRecord> {
    const src = await this.get(id)
    if (!src) throw new Error('Document not found')
    return this.create({ title: `${src.title}${copySuffix}`, folderId: src.folderId, content: src.content, contentText: src.contentText })
  }

  async move(id: string, folderId: string | null) {
    await this.db.update(documents).set({ folderId, updatedAt: Date.now() }).where(eq(documents.id, id))
  }

  async setFavorite(id: string, fav: boolean) {
    await this.db.update(documents).set({ isFavorite: fav }).where(eq(documents.id, id))
  }

  async trash(id: string) {
    await this.db.update(documents).set({ deletedAt: Date.now() }).where(eq(documents.id, id))
  }

  async restore(id: string) {
    await this.db.update(documents).set({ deletedAt: null }).where(eq(documents.id, id))
  }

  async deleteForever(id: string) {
    await this.db.delete(documents).where(eq(documents.id, id))
  }

  async emptyTrash(): Promise<number> {
    const rows = await this.db.select({ id: documents.id }).from(documents).where(isNotNull(documents.deletedAt))
    if (rows.length) await this.db.delete(documents).where(isNotNull(documents.deletedAt))
    return rows.length
  }

  async markOpened(id: string) {
    await this.db.update(documents).set({ lastOpenedAt: Date.now() }).where(eq(documents.id, id))
  }

  async count(): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(documents).where(isNull(documents.deletedAt))
    return r?.n ?? 0
  }

  /* -------------------------------- folders -------------------------------- */

  async listFolders(): Promise<Folder[]> {
    const rows = await this.db
      .select({
        id: documentFolders.id,
        name: documentFolders.name,
        parentId: documentFolders.parentId,
        createdAt: documentFolders.createdAt,
        documentCount: sql<number>`(SELECT count(*) FROM documents d WHERE d.folder_id = ${documentFolders.id} AND d.deleted_at IS NULL)`
      })
      .from(documentFolders)
      .orderBy(asc(sql`lower(${documentFolders.name})`))
    return rows.map((r) => ({ ...r, documentCount: Number(r.documentCount) }))
  }

  async createFolder(name: string, parentId: string | null = null): Promise<Folder> {
    const f = { id: randomUUID(), name: name.trim() || 'New folder', parentId, createdAt: Date.now() }
    await this.db.insert(documentFolders).values(f)
    return { ...f, documentCount: 0 }
  }

  async renameFolder(id: string, name: string) {
    await this.db.update(documentFolders).set({ name: name.trim() || 'Folder' }).where(eq(documentFolders.id, id))
  }

  /** Deleting a folder never deletes documents: they move to "no folder". */
  async removeFolder(id: string) {
    await this.h.transaction(async () => {
      await this.db.update(documents).set({ folderId: null }).where(eq(documents.folderId, id))
      await this.db.update(documentFolders).set({ parentId: null }).where(eq(documentFolders.parentId, id))
      await this.db.delete(documentFolders).where(eq(documentFolders.id, id))
    })
  }

  /** For search across titles only (used by command palette). */
  async searchTitles(term: string, limit = 10) {
    return this.db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(and(isNull(documents.deletedAt), like(documents.title, `%${term}%`)))
      .limit(limit)
  }
}

/** Extracts plain text from a ProseMirror JSON tree (block nodes separated by newlines). */
export function extractText(node: unknown): string {
  const out: string[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const o = n as { type?: string; text?: string; content?: unknown[] }
    if (o.type === 'text' && typeof o.text === 'string') {
      out.push(o.text)
      return
    }
    if (o.type === 'hardBreak') {
      out.push('\n')
      return
    }
    if (Array.isArray(o.content)) {
      for (const c of o.content) walk(c)
    }
    if (o.type && ['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock', 'tableRow'].includes(o.type)) out.push('\n')
    if (o.type === 'tableCell' || o.type === 'tableHeader') out.push('\t')
  }
  walk(node)
  return out.join('').replace(/\n{3,}/g, '\n\n').trim()
}
