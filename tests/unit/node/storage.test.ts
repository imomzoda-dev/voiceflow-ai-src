import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase, runMigrations, type DatabaseHandle } from '../../../electron/db/client'
import { DocumentsRepository, extractText, countWords, SNAPSHOT_INTERVAL_MS } from '../../../electron/db/documents-repo'
import { DictationsRepository } from '../../../electron/db/dictations-repo'
import { BackupsRepository, DictionaryRepository, SettingsRepository, TemplatesRepository } from '../../../electron/db/misc-repos'
import { SettingsService } from '../../../electron/services/settings-service'
import { BackupService } from '../../../electron/services/backup-service'
import { SecretsService, type SafeStorageLike } from '../../../electron/services/secrets-service'
import { mergeSettings, DEFAULT_SETTINGS } from '../../../shared/settings'

const MIGRATIONS = join(__dirname, '..', '..', '..', 'database', 'migrations')

async function freshDb(): Promise<DatabaseHandle> {
  const dir = mkdtempSync(join(tmpdir(), 'vf-db-'))
  const h = openDatabase(join(dir, 'test.db'))
  await runMigrations(h, MIGRATIONS)
  return h
}

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Сарлавҳа' }] }, { type: 'paragraph', content: [{ type: 'text', text }] }] })

describe('documents repository (real SQLite via node:sqlite)', () => {
  let h: DatabaseHandle
  let repo: DocumentsRepository
  beforeEach(async () => {
    h = await freshDb()
    repo = new DocumentsRepository(h)
  })

  it('creates, updates, searches and keeps full structure', async () => {
    const d = await repo.create({ title: 'Ҳисобот', content: doc('Ҷамъбасти кор') })
    expect(d.wordCount).toBe(3)
    await repo.update(d.id, { content: doc('Ҷамъбасти кори моҳи октябр'), title: 'Ҳисоботи нав' })
    const got = await repo.get(d.id)
    expect(got?.title).toBe('Ҳисоботи нав')
    expect((got?.content as { content: { type: string }[] }).content[0].type).toBe('heading')
    expect((await repo.list({ search: 'октябр' })).map((x) => x.id)).toEqual([d.id])
    expect(await repo.list({ search: '100%_' })).toEqual([])
  })

  it('throttles automatic version snapshots and restores versions', async () => {
    const d = await repo.create({ content: doc('v1') })
    await repo.update(d.id, { content: doc('v2') }) // first change → snapshot of v1
    await repo.update(d.id, { content: doc('v3') }) // within interval → no snapshot
    let versions = await repo.versions(d.id)
    expect(versions).toHaveLength(1)
    // Simulate time passing
    h.raw.prepare('UPDATE documents SET last_snapshot_at = ? WHERE id = ?').run(Date.now() - SNAPSHOT_INTERVAL_MS - 1, d.id)
    await repo.update(d.id, { content: doc('v4') })
    versions = await repo.versions(d.id)
    expect(versions).toHaveLength(2)
    const restored = await repo.restoreVersion(versions[versions.length - 1].id)
    expect(restored?.contentText).toContain('v1')
  })

  it('trash, restore, favourites, folders and duplicate', async () => {
    const f = await repo.createFolder('Кор')
    const d = await repo.create({ title: 'A', folderId: f.id })
    await repo.setFavorite(d.id, true)
    expect((await repo.list({ scope: 'favorites' })).length).toBe(1)
    await repo.trash(d.id)
    expect((await repo.list()).length).toBe(0)
    expect((await repo.list({ scope: 'trash' })).length).toBe(1)
    await repo.restore(d.id)
    const copy = await repo.duplicate(d.id)
    expect(copy.title).toBe('A (copy)')
    await repo.removeFolder(f.id)
    expect((await repo.get(d.id))?.folderId).toBeNull()
    expect(await repo.emptyTrash()).toBe(0)
  })

  it('extracts text and counts words for Cyrillic/Tajik', () => {
    expect(extractText(doc('Салом, дунё!'))).toBe('Сарлавҳа\nСалом, дунё!')
    expect(countWords("Ман ба Душанбе рафтам. It's fine — o'zbek")).toBe(7)
  })
})

describe('dictation history & statistics', () => {
  it('computes real stats from rows only', async () => {
    const h = await freshDb()
    const r = new DictationsRepository(h)
    const empty = await r.stats(0)
    expect(empty).toMatchObject({ totalWords: 0, totalDictations: 0 })
    const base = { languageSource: null, speechProvider: 'whisper-cpp', speechModel: 'base', mode: 'correct', correctedText: null, error: null, target: 'external', audioPath: null, documentId: null }
    await r.insert({ ...base, id: 'a', startedAt: Date.now(), durationMs: 3000, language: 'tg', originalText: 'x', finalText: 'салом дунё', status: 'success', wordCount: 2 })
    await r.insert({ ...base, id: 'b', startedAt: Date.now(), durationMs: 1000, language: 'ru', originalText: 'y', finalText: '', status: 'error', wordCount: 0 })
    const s = await r.stats(5)
    expect(s).toMatchObject({ totalWords: 2, totalDictations: 1, totalDurationMs: 3000, wordsToday: 2, documentsCount: 5 })
    expect(s.languages).toEqual([{ language: 'tg', count: 1 }])
    expect(s.daily).toHaveLength(7)
    expect((await r.list({ search: 'салом' })).total).toBe(1)
    expect((await r.list({ status: 'error' })).items[0].id).toBe('b')
  })
})

describe('settings', () => {
  it('merges stored values over defaults and drops invalid sections', () => {
    const m = mergeSettings({ appearance: { theme: 'dark' }, voice: { maxDurationSec: -5 } })
    expect(m.appearance.theme).toBe('dark')
    expect(m.voice).toEqual(DEFAULT_SETTINGS.voice)
  })
  it('persists through the service and rejects invalid patches', async () => {
    const h = await freshDb()
    const svc = new SettingsService(new SettingsRepository(h))
    await svc.load()
    await svc.update('writing', { mode: 'professional' })
    const again = new SettingsService(new SettingsRepository(h))
    expect((await again.load()).writing.mode).toBe('professional')
    await expect(svc.update('appearance', { theme: 'neon' as never })).rejects.toThrow()
  })
})

describe('backup', () => {
  it('round-trips documents, dictionary and templates; never includes secrets', async () => {
    const h = await freshDb()
    const docs = new DocumentsRepository(h)
    await new TemplatesRepository(h).seedBuiltins()
    await new DictionaryRepository(h).upsert({ original: 'a', preferred: 'Ҷ', language: 'tg', alias: null, category: 'term' })
    const d = await docs.create({ title: 'Backup me', content: doc('матн') })
    const svc = new BackupService(h, new BackupsRepository(h), '0.1.0')
    const file = join(mkdtempSync(join(tmpdir(), 'vf-bk-')), 'x.vfbackup')
    const info = await svc.createAt(file, 'manual')
    expect(info.status).toBe('ok')

    const h2 = await freshDb()
    const svc2 = new BackupService(h2, new BackupsRepository(h2), '0.1.0')
    const counts = await svc2.restoreFrom(file)
    expect(counts.documents).toBe(1)
    expect(counts.templates).toBe(10)
    expect((await new DocumentsRepository(h2).get(d.id))?.title).toBe('Backup me')
    expect((await new DictionaryRepository(h2).list())[0].preferred).toBe('Ҷ')
  })
  it('rejects files that are not backups', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'vf-bk-')), 'bad.vfbackup')
    writeFileSync(f, 'hello')
    const h = await freshDb()
    await expect(new BackupService(h, new BackupsRepository(h), '1').restoreFrom(f)).rejects.toThrow(/not a VoiceFlow AI backup/)
  })
})

describe('secrets', () => {
  const fakeStorage = (available = true): SafeStorageLike => ({
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(s, 'utf8').map((b) => b ^ 0x5a) as Buffer,
    decryptString: (b) => Buffer.from(b.map((x) => x ^ 0x5a)).toString('utf8')
  })
  it('stores keys only in encrypted form', async () => {
    const { readFileSync } = await import('node:fs')
    const file = join(mkdtempSync(join(tmpdir(), 'vf-sec-')), 'secrets.bin')
    const s = new SecretsService(file, fakeStorage())
    s.set('p1', 'sk-test-ABCDEF123456')
    expect(readFileSync(file).toString('utf8')).not.toContain('sk-test')
    expect(new SecretsService(file, fakeStorage()).get('p1')).toBe('sk-test-ABCDEF123456')
  })
  it('refuses to store keys when OS encryption is unavailable', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'vf-sec-')), 'secrets.bin')
    expect(() => new SecretsService(file, fakeStorage(false)).set('p', 'k')).toThrow(/secure storage/)
  })
})
