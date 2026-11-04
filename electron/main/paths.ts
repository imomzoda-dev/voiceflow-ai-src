import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

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
    temp: join(app.getPath('temp'), 'voiceflow-ai'),
    logs: app.getPath('logs'),
    backups: join(userData, 'backups'),
    secrets: join(userData, 'secrets.bin'),
    migrations: app.isPackaged ? join(process.resourcesPath, 'migrations') : join(app.getAppPath(), 'database', 'migrations')
  }
  for (const dir of [p.models, p.bin, p.audio, p.temp, p.logs, p.backups]) mkdirSync(dir, { recursive: true })
  cached = p
  return p
}
