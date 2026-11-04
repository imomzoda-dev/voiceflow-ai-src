/**
 * whisper.cpp provider: runs the official `whisper-cli` executable as a short-lived child
 * process per dictation. Nothing is loaded at app start; the model is only read from disk
 * while a transcription runs.
 */
import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { cpus } from 'node:os'
import { SpeechError, parseWhisperDetectedLanguage, parseWhisperJson, type SpeechProvider, type TranscriptionRequest, type TranscriptionResult } from './types'
import { normalizeLanguageCode } from '../../../shared/languages'
import { createLogger } from '../../main/logger'

const log = createLogger('whisper.cpp')

export interface WhisperCppOptions {
  binaryPath: string | null
  modelPath: string | null
  modelId: string
  threads: number
  quality: 'fast' | 'balanced' | 'accurate'
  useGpu: boolean
  timeoutMs?: number
}

export class WhisperCppProvider implements SpeechProvider {
  readonly id = 'whisper-cpp'
  readonly displayName = 'whisper.cpp (local)'

  constructor(private readonly opts: WhisperCppOptions) {}

  async initialize() {
    if (!this.opts.binaryPath || !existsSync(this.opts.binaryPath)) throw new SpeechError('binary-missing', 'whisper.cpp executable not found')
    if (!this.opts.modelPath || !existsSync(this.opts.modelPath)) throw new SpeechError('model-missing', `Model ${this.opts.modelId} is not installed`)
  }

  buildArgs(req: Pick<TranscriptionRequest, 'wavPath' | 'language' | 'prompt'>, outBase: string): string[] {
    const threads = this.opts.threads > 0 ? this.opts.threads : Math.max(1, Math.min(8, cpus().length - 1))
    const args = ['-m', this.opts.modelPath!, '-f', req.wavPath, '-l', req.language ?? 'auto', '-oj', '-of', outBase, '-t', String(threads)]
    if (this.opts.quality === 'fast') args.push('-bs', '1', '-bo', '1')
    if (this.opts.quality === 'accurate') args.push('-bs', '8', '-bo', '8')
    if (!this.opts.useGpu) args.push('-ng')
    if (req.prompt) args.push('--prompt', req.prompt)
    return args
  }

  async transcribe(req: TranscriptionRequest): Promise<TranscriptionResult> {
    await this.initialize()
    const outBase = req.wavPath.replace(/\.wav$/i, '')
    const args = this.buildArgs(req, outBase)
    const started = Date.now()
    const stderr = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.opts.binaryPath!, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (d: string) => {
        err += d
        if (err.length > 200_000) err = err.slice(-100_000)
      })
      const timeout = setTimeout(() => {
        child.kill()
        reject(new SpeechError('timeout', 'whisper.cpp did not finish in time'))
      }, this.opts.timeoutMs ?? Math.max(60_000, req.durationMs * 6))
      const onAbort = () => {
        child.kill()
        reject(new SpeechError('unknown', 'cancelled'))
      }
      req.signal.addEventListener('abort', onAbort, { once: true })
      child.on('error', (e) => {
        clearTimeout(timeout)
        reject(new SpeechError('binary-missing', `Failed to start whisper.cpp: ${e.message}`))
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        req.signal.removeEventListener('abort', onAbort)
        if (code === 0) resolve(err)
        else {
          log.error(`whisper-cli exited with ${code}`, { tail: err.split('\n').slice(-6).join(' | ') })
          reject(new SpeechError('transcription-failed', `whisper.cpp exited with code ${code}`))
        }
      })
    })
    const jsonPath = `${outBase}.json`
    try {
      const parsed = parseWhisperJson(JSON.parse(await readFile(jsonPath, 'utf8')))
      const detected = parseWhisperDetectedLanguage(stderr)
      log.info('Transcribed', { ms: Date.now() - started, audioMs: req.durationMs, lang: parsed.language ?? detected?.language })
      return {
        text: parsed.text,
        language: normalizeLanguageCode(parsed.language ?? detected?.language ?? req.language),
        probability: req.language ? undefined : detected && Number.isFinite(detected.probability) ? detected.probability : undefined,
        provider: this.id,
        model: this.opts.modelId
      }
    } catch (e) {
      if (e instanceof SpeechError) throw e
      throw new SpeechError('transcription-failed', 'Could not read whisper.cpp output')
    } finally {
      await rm(jsonPath, { force: true }).catch(() => undefined)
    }
  }

  getSupportedLanguages(): 'any' {
    return 'any'
  }

  getCapabilities() {
    return { local: true, languageDetection: true, vocabularyPrompt: true, forcedLanguage: true, streaming: false }
  }

  async dispose() {
    /* process-per-request: nothing to release */
  }
}
