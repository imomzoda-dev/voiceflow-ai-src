/**
 * SQLite access via Node's built-in `node:sqlite` (bundled with Electron 45) and Drizzle ORM's
 * sqlite-proxy driver. No native addon has to be rebuilt per Electron version.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator'
import * as schema from '../../database/schema'

export type AppDatabase = SqliteRemoteDatabase<typeof schema>

export interface DatabaseHandle {
  db: AppDatabase
  raw: DatabaseSync
  /** Runs `fn` inside BEGIN/COMMIT; rolls back on error. */
  transaction<T>(fn: () => Promise<T>): Promise<T>
  close(): void
}

function bindable(params: unknown[]): (null | number | bigint | string | Uint8Array)[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null
    if (typeof p === 'boolean') return p ? 1 : 0
    if (p instanceof Date) return p.getTime()
    return p as number | string | bigint | Uint8Array
  })
}

export function openDatabase(file: string): DatabaseHandle {
  const raw = new DatabaseSync(file)
  raw.exec('PRAGMA journal_mode = WAL;')
  raw.exec('PRAGMA synchronous = NORMAL;')
  raw.exec('PRAGMA foreign_keys = ON;')
  raw.exec('PRAGMA busy_timeout = 5000;')

  const cache = new Map<string, ReturnType<DatabaseSync['prepare']>>()
  const prepare = (sql: string) => {
    let stmt = cache.get(sql)
    if (!stmt) {
      stmt = raw.prepare(sql)
      stmt.setReturnArrays(true)
      if (cache.size > 500) cache.clear()
      cache.set(sql, stmt)
    }
    return stmt
  }

  const exec = (sql: string, params: unknown[], method: 'run' | 'all' | 'values' | 'get') => {
    const stmt = prepare(sql)
    const args = bindable(params)
    switch (method) {
      case 'run':
        stmt.run(...args)
        return { rows: [] }
      case 'get': {
        const row = stmt.get(...args)
        return { rows: (row ?? undefined) as unknown as unknown[] }
      }
      default:
        return { rows: stmt.all(...args) as unknown[] }
    }
  }

  const db = drizzle(
    async (sql, params, method) => exec(sql, params, method),
    async (batch) => batch.map((b) => exec(b.sql, b.params, b.method)),
    { schema }
  )

  // Transactions are serialised: the driver is synchronous underneath, but callers await
  // between statements, so two concurrent IPC handlers must not interleave BEGIN/COMMIT.
  let queue: Promise<unknown> = Promise.resolve()
  return {
    db,
    raw,
    transaction<T>(fn: () => Promise<T>): Promise<T> {
      const run = async () => {
        raw.exec('BEGIN IMMEDIATE')
        try {
          const result = await fn()
          raw.exec('COMMIT')
          return result
        } catch (err) {
          raw.exec('ROLLBACK')
          throw err
        }
      }
      const p = queue.then(run, run)
      queue = p.catch(() => undefined)
      return p
    },
    close() {
      cache.clear()
      try {
        raw.exec('PRAGMA wal_checkpoint(TRUNCATE);')
      } catch {
        /* ignore */
      }
      raw.close()
    }
  }
}

export async function runMigrations(handle: DatabaseHandle, migrationsFolder: string): Promise<void> {
  await migrate(
    handle.db,
    async (queries) => {
      handle.raw.exec('BEGIN')
      try {
        for (const q of queries) if (q.trim()) handle.raw.exec(q)
        handle.raw.exec('COMMIT')
      } catch (e) {
        handle.raw.exec('ROLLBACK')
        throw e
      }
    },
    { migrationsFolder }
  )
}
