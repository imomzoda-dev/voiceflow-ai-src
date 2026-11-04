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
import { constants as osConstants, cpus, setPriority } from 'node:os'
import { dirname, join } from 'node:path'
import { SpeechError, cleanTranscript, type SpeechProvider, type TranscriptionRequest, type TranscriptionResult } from './types'
import { normalizeLanguageCode } from '../../../shared/languages'
import { encodeWav } from '../../../shared/audio'
import { hasRepeatedPhrase } from '../../../shared/scripts'
import { createLogger } from '../../main/logger'

const log = createLogger('whisper-server')
const IDLE_MS = 10 * 60_000

export interface ServerConfig {
  /** Preferred build (e.g. CUDA). */
  cliPath: string
  /** CPU build to fall back to when the preferred build cannot start (missing driver, old GPU…). */
  fallbackCliPath?: string | null
  modelPath: string
  modelId: string
  threads: number
  useGpu: boolean
  /** Encoder window in frames (512 = 10 s, fast for phrases ≤ 9.5 s); 0 = the model's full 30 s. */
  audioCtx?: number
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
  private failedCli = new Set<string>()
  /** When the last phrase was recognised (to report the engine that is actually in use). */
  lastAt = 0
  info: { backend: 'gpu' | 'cpu' | null; device: string | null; lastAudioMs: number | null; lastMs: number | null } = { backend: null, device: null, lastAudioMs: null, lastMs: null }

  isRunning() {
    return !!this.child && this.child.exitCode === null
  }

  private configKey(c: ServerConfig) {
    return `${c.cliPath}|${c.modelPath}|${c.threads}|${c.useGpu}|${c.audioCtx ?? 512}`
  }

  /** Starts (or reuses) the server; a GPU build that cannot start is remembered and the CPU build is used. */
  async ensure(c: ServerConfig): Promise<number> {
    const usable = !this.failedCli.has(c.cliPath) ? c : c.fallbackCliPath ? { ...c, cliPath: c.fallbackCliPath, fallbackCliPath: null } : c
    try {
      return await this.ensureExact(usable)
    } catch (e) {
      if (!usable.fallbackCliPath) throw e
      log.warn('preferred whisper build failed to start; falling back to CPU', { message: (e as Error).message })
      this.failedCli.add(usable.cliPath)
      return this.ensureExact({ ...usable, cliPath: usable.fallbackCliPath, fallbackCliPath: null })
    }
  }

  private async ensureExact(c: ServerConfig): Promise<number> {
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
    // Hyper-threads help whisper.cpp's encoder (≈15% faster with 16 than 8 threads on an i9-9900K).
    const threads = c.threads > 0 ? c.threads : Math.max(1, Math.min(16, cpus().length - 1))
    // --audio-ctx 512 = 10.24 s encoder window (phrases are cut to ≤ 9.5 s by the recorder):
    // ~4× faster than the default 30 s window on CPU, identical transcripts in our tests.
    const audioCtx = c.audioCtx ?? 512
    const args = ['-m', c.modelPath, '--host', '127.0.0.1', '--port', String(this.port), '-t', String(threads), '-l', 'auto']
    if (audioCtx > 0) args.push('-ac', String(audioCtx))
    if (!c.useGpu) args.push('-ng')
    log.info('starting whisper-server', { model: c.modelId, port: this.port, threads })
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    this.child = child
    // Below-normal priority: recognition (all cores, or the one-time CUDA kernel compile) must never
    // starve microphone capture — with live typing the next phrase is recorded while one is recognised.
    try {
      if (child.pid) setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL)
    } catch (e) {
      log.warn('could not lower whisper-server priority', { message: (e as Error).message })
    }
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
    const cuda = /using (CUDA\d*) backend|ggml_cuda_init: found [1-9]/i.test(this.stderrTail)
    const dev = /Device \d+: ([^,\n]+), compute capability/i.exec(this.stderrTail)?.[1]?.trim() ?? null
    this.info = { ...this.info, backend: cuda ? 'gpu' : 'cpu', device: cuda ? dev : null }
    log.info('whisper-server ready', { backend: this.info.backend, device: this.info.device })
    // The first inference compiles GPU kernels / fills caches (≈ 1.5 s extra on a GTX 1050 Ti):
    // do it now on 1 s of silence, while the user is still choosing a language.
    void this.warmUp(port)
    return port
  }

  private async warmUp(port: number) {
    try {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(encodeWav(new Float32Array(16_000)))], { type: 'audio/wav' }), 'warmup.wav')
      form.append('response_format', 'json')
      form.append('language', 'en')
      const started = Date.now()
      await fetch(`http://127.0.0.1:${port}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) })
      log.info('whisper-server warmed up', { ms: Date.now() - started })
    } catch {
      /* best effort */
    }
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
    // Beam search (5): fewer errors and no repetition loops; free on a GPU, ~25% slower on a CPU,
    // where greedy decoding is used and a phrase is redone with beam search only if it loops.
    const onGpu = this.info.backend === 'gpu'
    const first = await this.request(port, req, onGpu ? 5 : 0)
    if (onGpu || !hasRepeatedPhrase(first.text)) return first
    log.info('Repetition in the transcript; recognising the phrase again with beam search')
    return this.request(port, req, 5)
  }

  private async request(port: number, req: TranscriptionRequest, beamSize: number): Promise<{ text: string; language: string | null }> {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(req.wav)], { type: 'audio/wav' }), 'speech.wav')
    form.append('response_format', 'verbose_json')
    form.append('language', req.language ?? 'auto')
    form.append('temperature', '0')
    if (beamSize > 1) form.append('beam_size', String(beamSize))
    if (req.prompt) form.append('prompt', req.prompt)
    const timeout = AbortSignal.timeout(Math.max(120_000, req.durationMs * 12))
    const started = Date.now()
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
    this.info = { ...this.info, lastAudioMs: Math.round(req.durationMs), lastMs: Date.now() - started }
    this.lastAt = Date.now()
    log.info('Transcribed', { ms: this.info.lastMs, audioMs: this.info.lastAudioMs, backend: this.info.backend })
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
