/**
 * Small rotating file logger. Never logs API keys, auth headers or document/dictation text:
 * callers pass metadata only, and `redact()` scrubs anything that looks like a secret.
 */
import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

type Level = 'debug' | 'info' | 'warn' | 'error'

const MAX_BYTES = 2 * 1024 * 1024
let file: string | null = null

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk|gsk|pk|rk|xai|sk-ant|sk-or)-[A-Za-z0-9_-]{8,}/g,
  /(authorization|x-api-key|api[-_]?key)(["']?\s*[:=]\s*["']?)(bearer\s+)?[^\s"',}]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g
]

export function redact(input: string): string {
  let out = input
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (_m, a, b) => (typeof a === 'string' && typeof b === 'string' && /[:=]/.test(b) ? `${a}${b}[REDACTED]` : '[REDACTED]'))
  }
  return out
}

export function initLogger(dir: string) {
  file = join(dir, 'voiceflow.log')
}

function write(level: Level, scope: string, message: string, meta?: unknown) {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${redact(message)}${meta === undefined ? '' : ' ' + redact(safeJson(meta))}\n`
  if (level === 'error' || level === 'warn') process.stderr.write(line)
  else if (!process.env.VOICEFLOW_QUIET) process.stdout.write(line)
  if (!file) return
  try {
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`)
    appendFileSync(file, line, 'utf8')
  } catch {
    /* logging must never crash the app */
  }
}

function safeJson(v: unknown): string {
  if (v instanceof Error) return JSON.stringify({ name: v.name, message: v.message, stack: v.stack?.split('\n').slice(0, 6).join(' | ') })
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function createLogger(scope: string) {
  return {
    debug: (m: string, meta?: unknown) => write('debug', scope, m, meta),
    info: (m: string, meta?: unknown) => write('info', scope, m, meta),
    warn: (m: string, meta?: unknown) => write('warn', scope, m, meta),
    error: (m: string, meta?: unknown) => write('error', scope, m, meta)
  }
}

export type Logger = ReturnType<typeof createLogger>
