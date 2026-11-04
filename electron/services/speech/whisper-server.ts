/**
 * Persistent whisper.cpp engine: runs the official `whisper-server` on 127.0.0.1 with the model
 * loaded once, so every phrase of live typing is recognised without reloading the model
 * (≈ 2-5× faster than starting whisper-cli per request). Started lazily (when a dictation
 * begins), restarted when the model/threads/GPU setting changes, stopped after 10 idle minutes
 * and on quit. Falls back to whisper-cli (whisper-cpp.ts) when the server binary is absent.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { SpeechError, cleanTranscript, type SpeechProvider, type TranscriptionRequest, type TranscriptionResult } from './types'
import { normalizeLanguageCode } from '../../../shared/languages'
import { createLogger } from '../../main/logger'

const log = createLogger('whisper-server')
const IDLE_MS = 10 * 60_000

export interface ServerConfig {
  cliPath: string
  modelPath: string
  modelId: string
  threads: number
  useGpu: boolean
}

/** whisper-server lives next to whisper-cli in official builds and in Homebrew's whisper-cpp. */
export function serverBinaryFor(cliPath: string): string | null {
  const name = process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server'
  const p = join(dirname(cliPath), name)
  return existsSync(p) ? p : null
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

interface VerboseJson {
  text?: string
  language?: string
  segments?: { text?: string }[]
}

export class WhisperServerManager {
  private child: ChildProcess | null = null
  private port = 0
  private key = ''
  private ready: Promise<void> | null = null
  private idle: NodeJS.Timeout | null = null
  private stderrTail = ''

  isRunning() {
    return !!this.child && this.child.exitCode === null
  }

  private configKey(c: ServerConfig) {
    return `${c.cliPath}|${c.modelPath}|${c.threads}|${c.useGpu}`
  }

  /** Starts (or reuses) the server for this configuration and resolves when it accepts requests. */
  async ensure(c: ServerConfig): Promise<number> {
    this.touch()
    const key = this.configKey(c)
    if (this.ready && this.key === key && this.isRunning()) {
      await this.ready
      return this.port
    }
    this.stop()
    const bin = serverBinaryFor(c.cliPath)
    if (!bin) throw new SpeechError('binary-missing', 'whisper-server is not available')
    this.key = key
    this.port = await freePort()
    const threads = c.threads > 0 ? c.threads : Math.max(1, Math.min(8, cpus().length - 1))
    const args = ['-m', c.modelPath, '--host', '127.0.0.1', '--port', String(this.port), '-t', String(threads), '-l', 'auto']
    if (!c.useGpu) args.push('-ng')
    log.info('starting whisper-server', { model: c.modelId, port: this.port, threads })
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    this.child = child
    this.stderrTail = ''
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (d: string) => {
      this.stderrTail = (this.stderrTail + d).slice(-4000)
    })
    child.on('exit', (code) => {
      if (this.child === child) {
        log.warn(`whisper-server exited (${code})`, { tail: this.stderrTail.split('\n').slice(-4).join(' | ') })
        this.child = null
        this.ready = null
      }
    })
    const port = this.port
    this.ready = (async () => {
      const deadline = Date.now() + 90_000 // large models can take a while to load on slow disks
      while (Date.now() < deadline) {
        if (this.child !== child || child.exitCode !== null) throw new SpeechError('transcription-failed', 'whisper-server stopped while loading the model')
        try {
          const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })
          if (r.status < 500) return
        } catch {
          /* not listening yet */
        }
        await new Promise((res) => setTimeout(res, 200))
      }
      throw new SpeechError('timeout', 'whisper-server did not start in time')
    })()
    try {
      await this.ready
    } catch (e) {
      this.stop()
      throw e
    }
    log.info('whisper-server ready')
    return port
  }

  private touch() {
    if (this.idle) clearTimeout(this.idle)
    this.idle = setTimeout(() => {
      log.info('unloading whisper-server after idle period')
      this.stop()
    }, IDLE_MS)
    this.idle.unref()
  }

  async transcribe(c: ServerConfig, req: TranscriptionRequest): Promise<{ text: string; language: string | null }> {
    const port = await this.ensure(c)
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(req.wav)], { type: 'audio/wav' }), 'speech.wav')
    form.append('response_format', 'verbose_json')
    form.append('language', req.language ?? 'auto')
    form.append('temperature', '0')
    if (req.prompt) form.append('prompt', req.prompt)
    const timeout = AbortSignal.timeout(Math.max(60_000, req.durationMs * 6))
    let res: Response
    try {
      res = await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: form, signal: AbortSignal.any([req.signal, timeout]) })
    } catch (e) {
      if (req.signal.aborted) throw new SpeechError('unknown', 'cancelled')
      if (timeout.aborted) throw new SpeechError('timeout', 'whisper-server did not finish in time')
      throw new SpeechError('transcription-failed', `whisper-server request failed: ${(e as Error).message}`)
    }
    this.touch()
    if (!res.ok) throw new SpeechError('transcription-failed', `whisper-server returned HTTP ${res.status}`)
    const j = (await res.json()) as VerboseJson
    // `text` joins segments with newlines that can split a word ("расп\nределили"): join segments instead.
    const raw = j.segments?.length ? j.segments.map((s) => s.text ?? '').join('') : (j.text ?? '').replace(/\n/g, '')
    return { text: cleanTranscript(raw), language: normalizeLanguageCode(j.language ?? req.language) }
  }

  stop() {
    if (this.idle) clearTimeout(this.idle)
    this.idle = null
    const c = this.child
    this.child = null
    this.ready = null
    if (c && c.exitCode === null) c.kill()
  }
}

/** SpeechProvider facade over the shared server manager. */
export class WhisperServerProvider implements SpeechProvider {
  readonly id = 'whisper-cpp'
  readonly displayName = 'whisper.cpp (local)'
  constructor(
    private readonly manager: WhisperServerManager,
    private readonly cfg: ServerConfig
  ) {}

  async initialize() {
    if (!existsSync(this.cfg.modelPath)) throw new SpeechError('model-missing', `Model ${this.cfg.modelId} is not installed`)
  }

  /** Loads the model in the background so the first phrase is fast. */
  prewarm() {
    void this.manager.ensure(this.cfg).catch((e) => log.warn('prewarm failed', { message: (e as Error).message }))
  }

  async transcribe(req: TranscriptionRequest): Promise<TranscriptionResult> {
    await this.initialize()
    const r = await this.manager.transcribe(this.cfg, req)
    return { text: r.text, language: r.language, provider: this.id, model: this.cfg.modelId }
  }

  getSupportedLanguages(): 'any' {
    return 'any'
  }

  getCapabilities() {
    return { local: true, languageDetection: true, vocabularyPrompt: true, forcedLanguage: true, streaming: false }
  }

  async dispose() {}
}
