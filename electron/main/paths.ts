import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'

let cached: AppPaths | null = null

export interface AppPaths {
  userData: string
  database: string
  models: string
  bin: string
  audio: string
  temp: string
  logs: string
  backups: string
  secrets: string
  migrations: string
}

export function appPaths(): AppPaths {
  if (cached) return cached
  const userData = app.getPath('userData')
  const p: AppPaths = {
    userData,
    database: join(userData, 'voiceflow.db'),
    models: join(userData, 'models'),
    bin: join(userData, 'bin'),
    audio: join(userData, 'audio'),
    // Inside the app's own folder, not the system %TEMP%: disk cleaners (Windows Storage Sense,
    // cleanup tools) delete folders there while the app runs, and every dictation then failed.
    temp: join(userData, 'temp'),
    logs: app.getPath('logs'),
    backups: join(userData, 'backups'),
    secrets: join(userData, 'secrets.bin'),
    migrations: app.isPackaged ? join(process.resourcesPath, 'migrations') : join(app.getAppPath(), 'database', 'migrations')
  }
  for (const dir of [p.models, p.bin, p.audio, p.temp, p.logs, p.backups]) mkdirSync(dir, { recursive: true })
  removeStaleTempFiles(p.temp)
  cached = p
  return p
}

/** Leftovers of interrupted dictations/downloads (older than a day) — nobody else cleans this folder. */
function removeStaleTempFiles(dir: string, maxAgeMs = 24 * 60 * 60_000) {
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      try {
        if (Date.now() - statSync(full).mtimeMs > maxAgeMs) rmSync(full, { recursive: true, force: true })
      } catch {
        /* in use or already gone */
      }
    }
  } catch {
    /* best effort */
  }
}
