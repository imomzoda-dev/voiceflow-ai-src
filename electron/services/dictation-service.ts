/**
 * Dictation orchestrator — one state machine for global push-to-talk, toggle mode and the
 * in-app record button:
 *
 *   IDLE → RECORDING → PROCESSING → (CORRECTING) → INSERTING → SUCCESS → IDLE
 *                 ↘ cancel → IDLE         any step ↘ ERROR → IDLE
 *
 * Guards: single active session, late audio from a cancelled session is ignored, max duration,
 * recorder start/stop watchdogs, too-short presses cancelled, abortable transcription/AI calls.
 */
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { writeFile, rm, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppSettings } from '../../shared/settings'
import type { DictationErrorCode, DictationResult, DictationState, DictationTarget, ProcessingMode, VoiceCommandPayload } from '../../shared/types'
import { applyDictionary, buildVocabularyPrompt, type DictionaryEntry } from '../../shared/dictionary'
import { chooseAllowedLanguage, detectLanguages } from '../../shared/language-detect'
import { parseVoiceCommand } from '../../shared/voice-commands'
import { SpeechError, type SpeechProvider } from './speech/types'
import type { TextProcessor } from './ai/text-processor'
import type { DictationsRepository } from '../db/dictations-repo'
import { countWords } from '../db/documents-repo'
import { createLogger } from '../main/logger'

const log = createLogger('dictation')

export interface RecorderPort {
  start(cmd: { sessionId: string; deviceId: string | null; gain: number; maxDurationSec: number; autoStopOnSilence: boolean; silenceTimeoutSec: number }): void
  stop(sessionId: string): void
  cancel(sessionId: string): void
}

export interface OutputPort {
  /** True when the VoiceFlow editor currently has focus (main window focused + editor focused). */
  editorFocused(): boolean
  insertIntoEditor(text: string, resultId: string): void
  commandEditor(command: VoiceCommandPayload, resultId: string): void
  insertExternal(text: string): Promise<{ ok: boolean; error?: string }>
}

export interface DictationDeps {
  settings: () => AppSettings
  recorder: RecorderPort
  output: OutputPort
  speech: () => Promise<SpeechProvider>
  processor: Pick<TextProcessor, 'process'>
  dictionary: () => Promise<DictionaryEntry[]>
  history: Pick<DictationsRepository, 'insert' | 'update' | 'get' | 'latestSuccessful'>
  dirs: { temp: string; audio: string }
  /** Pre-flight check so we can fail before recording (e.g. model missing). */
  preflight: () => Promise<{ ok: true } | { ok: false; code: DictationErrorCode; message: string }>
  timings?: Partial<{ successHoldMs: number; errorHoldMs: number; recorderReadyTimeoutMs: number; audioTimeoutMs: number }>
}

interface Session {
  id: string
  startedAt: number
  activation: 'hold' | 'toggle' | 'manual'
  target: DictationTarget
  resolvedTarget: Exclude<DictationTarget, 'auto'> | null
  abort: AbortController
  timers: NodeJS.Timeout[]
  ready: boolean
}

export class DictationService extends EventEmitter {
  private state: DictationState
  private session: Session | null = null
  private resetTimer: NodeJS.Timeout | null = null
  private readonly t: Required<NonNullable<DictationDeps['timings']>>

  constructor(private readonly d: DictationDeps) {
    super()
    // Settings may not be loaded yet when the service is constructed; read them lazily.
    this.state = { phase: 'idle', sessionId: null, startedAt: null, language: null, mode: 'correct', message: null, errorCode: null, activation: 'hold', maxDurationSec: 120 }
    this.t = { successHoldMs: 1400, errorHoldMs: 3500, recorderReadyTimeoutMs: 5000, audioTimeoutMs: 12000, ...d.timings }
  }

  getState(): DictationState {
    if (this.state.phase === 'idle') {
      const s = this.d.settings()
      if (s) this.state = { ...this.state, mode: s.writing.mode, activation: s.voice.activationMode, maxDurationSec: s.voice.maxDurationSec }
    }
    return this.state
  }

  isRecording(): boolean {
    return this.state.phase === 'recording'
  }

  isBusy(): boolean {
    return ['recording', 'processing', 'correcting', 'inserting'].includes(this.state.phase)
  }

  private set(patch: Partial<DictationState>) {
    this.state = { ...this.state, ...patch }
    this.emit('state', this.state)
  }

  private clearSessionTimers() {
    if (this.session) for (const t of this.session.timers) clearTimeout(t)
  }

  private scheduleIdle(ms: number, sessionId: string | null) {
    if (this.resetTimer) clearTimeout(this.resetTimer)
    this.resetTimer = setTimeout(() => {
      if (this.state.sessionId === sessionId && !this.isBusy()) {
        this.set({ phase: 'idle', sessionId: null, startedAt: null, message: null, errorCode: null, language: null })
      }
    }, ms)
  }

  private fail(code: DictationErrorCode, message: string) {
    const id = this.session?.id ?? this.state.sessionId
    this.clearSessionTimers()
    this.session?.abort.abort()
    this.session = null
    this.set({ phase: 'error', errorCode: code, message })
    this.emit('ended', id)
    this.scheduleIdle(this.t.errorHoldMs, id)
  }

  async start(opts: { activation?: 'hold' | 'toggle' | 'manual'; target?: DictationTarget } = {}): Promise<{ ok: boolean; error?: string }> {
    if (this.isBusy()) return { ok: false, error: 'busy' }
    if (this.resetTimer) clearTimeout(this.resetTimer)
    const s = this.d.settings()
    const pre = await this.d.preflight()
    const id = randomUUID()
    if (!pre.ok) {
      this.set({ phase: 'error', sessionId: id, errorCode: pre.code, message: pre.message, mode: s.writing.mode })
      this.emit('ended', id)
      this.scheduleIdle(this.t.errorHoldMs, id)
      return { ok: false, error: pre.code }
    }
    if (this.isBusy()) return { ok: false, error: 'busy' } // re-check after await
    const activation = opts.activation ?? s.voice.activationMode
    this.session = { id, startedAt: Date.now(), activation, target: opts.target ?? 'auto', resolvedTarget: null, abort: new AbortController(), timers: [], ready: false }
    this.set({ phase: 'recording', sessionId: id, startedAt: this.session.startedAt, language: s.recognition.languageMode === 'single' ? s.recognition.language : null, mode: s.writing.mode, message: null, errorCode: null, activation, maxDurationSec: s.voice.maxDurationSec })
    this.emit('started', id)
    this.d.recorder.start({
      sessionId: id,
      deviceId: s.voice.microphoneId,
      gain: s.voice.inputGain,
      maxDurationSec: s.voice.maxDurationSec,
      autoStopOnSilence: s.voice.autoStopOnSilence,
      silenceTimeoutSec: s.voice.silenceTimeoutSec
    })
    const sess = this.session
    sess.timers.push(
      setTimeout(() => {
        if (this.session === sess && this.state.phase === 'recording') {
          log.info('Max duration reached; stopping')
          void this.stop()
        }
      }, s.voice.maxDurationSec * 1000),
      setTimeout(() => {
        if (this.session === sess && !sess.ready && this.state.phase === 'recording') {
          this.d.recorder.cancel(sess.id)
          this.fail('mic-unavailable', 'The microphone did not start')
        }
      }, this.t.recorderReadyTimeoutMs)
    )
    return { ok: true }
  }

  recorderReady(sessionId: string) {
    if (this.session?.id === sessionId) this.session.ready = true
  }

  async stop(): Promise<void> {
    const sess = this.session
    if (!sess || this.state.phase !== 'recording') return
    const s = this.d.settings()
    const held = Date.now() - sess.startedAt
    if (sess.activation === 'hold' && held < s.voice.minHoldMs) {
      this.d.recorder.cancel(sess.id)
      this.fail('too-short', 'Hold the key while speaking')
      return
    }
    // Decide where text goes at the moment the user finishes speaking.
    sess.resolvedTarget = sess.target === 'auto' ? (this.d.output.editorFocused() ? 'editor' : 'external') : sess.target
    this.clearSessionTimers()
    sess.timers = []
    this.set({ phase: 'processing' })
    this.d.recorder.stop(sess.id)
    sess.timers.push(
      setTimeout(() => {
        if (this.session === sess && this.state.phase === 'processing') this.fail('no-audio', 'No audio was received from the recorder')
      }, this.t.audioTimeoutMs)
    )
  }

  async toggle(opts: { target?: DictationTarget } = {}) {
    if (this.state.phase === 'recording') await this.stop()
    else if (!this.isBusy()) await this.start({ activation: 'toggle', ...opts })
  }

  cancel() {
    const sess = this.session
    if (!sess) return
    this.clearSessionTimers()
    sess.abort.abort()
    this.d.recorder.cancel(sess.id)
    this.session = null
    this.set({ phase: 'idle', sessionId: null, startedAt: null, message: null, errorCode: null, language: null })
    this.emit('ended', sess.id)
  }

  recorderError(sessionId: string, code: 'mic-unavailable' | 'mic-permission' | 'no-audio', message: string) {
    if (this.session?.id !== sessionId) return
    this.fail(code, message)
  }

  /** Audio arrives from the recorder window. */
  async receiveAudio(sessionId: string, wav: Buffer, meta: { durationMs: number; peak: number; rms: number }): Promise<void> {
    const sess = this.session
    if (!sess || sess.id !== sessionId || this.state.phase !== 'processing') {
      log.debug('Ignoring audio for inactive session')
      return
    }
    this.clearSessionTimers()
    sess.timers = []
    if (meta.durationMs < 300 || meta.peak < 0.01) {
      this.fail('no-audio', 'No speech was detected — check the microphone')
      return
    }
    const s = this.d.settings()
    const wavPath = join(this.d.dirs.temp, `${sessionId}.wav`)
    let keptAudio: string | null = null
    const mode: ProcessingMode = s.writing.mode
    let original = ''
    let language: string | null = null
    const startedAt = sess.startedAt
    try {
      await writeFile(wavPath, wav)
      const speech = await this.d.speech()
      const dictionary = await this.d.dictionary()
      const rec = s.recognition
      const forced = rec.languageMode === 'single' ? rec.language : null
      const prompt = buildVocabularyPrompt(dictionary, forced)
      let tr = await speech.transcribe({ wavPath, wav, language: forced, prompt, signal: sess.abort.signal, durationMs: meta.durationMs })
      if (rec.languageMode === 'multiple' && rec.allowedLanguages.length && speech.getCapabilities().forcedLanguage) {
        const pick = chooseAllowedLanguage(tr.text, tr.language, rec.allowedLanguages)
        if (pick && pick !== tr.language) {
          log.info('Detected language outside allowed set; re-running with forced language', { detected: tr.language, forced: pick })
          tr = await speech.transcribe({ wavPath, wav, language: pick, prompt: buildVocabularyPrompt(dictionary, pick), signal: sess.abort.signal, durationMs: meta.durationMs })
          tr.language = pick
        }
      }
      if (this.session !== sess) return
      original = tr.text.trim()
      if (!original) {
        this.fail('empty-transcript', 'Nothing was recognised')
        await this.record(sess, { status: 'error', error: 'empty-transcript', original: '', corrected: null, final: '', language: tr.language, mode, durationMs: meta.durationMs, provider: tr.provider, model: tr.model, audioPath: null, startedAt })
        return
      }
      const detection = detectLanguages(original, { language: tr.language, probability: tr.probability })
      language = detection.language
      this.set({ language })
      const target = sess.resolvedTarget ?? 'external'

      // Voice commands (editor only, whole-utterance match, before any AI call).
      if (target === 'editor' && s.voice.voiceCommands) {
        const cmd = parseVoiceCommand(original)
        if (cmd) {
          const id = sessionId
          this.d.output.commandEditor(cmd, id)
          await this.record(sess, { status: 'command', error: null, original, corrected: null, final: original, language, mode, durationMs: meta.durationMs, provider: tr.provider, model: tr.model, audioPath: null, startedAt })
          this.finishSuccess(sess, { id, original, corrected: null, final: original, language, languageSource: detection.source, engineProbability: detection.engineProbability, segments: detection.segments, mode, correctionStatus: 'skipped', durationMs: meta.durationMs, target, command: cmd })
          return
        }
      }

      const withDict = applyDictionary(original, dictionary, language).text
      if (mode !== 'raw') this.set({ phase: 'correcting' })
      const outcome = await this.d.processor.process(withDict, mode, language, dictionary, sess.abort.signal)
      if (this.session !== sess) return
      const final = applyDictionary(outcome.final, dictionary, language).text

      this.set({ phase: 'inserting', message: outcome.status === 'failed' || outcome.status === 'not-configured' ? (outcome.error ?? null) : null })
      if (outcome.status === 'failed' && !s.writing.fallbackToRaw) {
        throw new SpeechError(outcome.errorCode ?? 'provider-error', outcome.error ?? 'Correction failed')
      }
      if (target === 'editor') this.d.output.insertIntoEditor(final, sessionId)
      else if (target === 'external') {
        const r = await this.d.output.insertExternal(final)
        if (!r.ok) {
          await this.record(sess, { status: 'error', error: 'insert-failed', original, corrected: outcome.corrected, final, language, mode, durationMs: meta.durationMs, provider: tr.provider, model: tr.model, audioPath: null, startedAt })
          this.fail('insert-failed', r.error ?? 'Could not insert text; it was copied to the clipboard')
          return
        }
      }
      if (s.storage.saveAudio) {
        keptAudio = join(this.d.dirs.audio, `${sessionId}.wav`)
        await rename(wavPath, keptAudio).catch(() => {
          keptAudio = null
        })
      }
      await this.record(sess, { status: 'success', error: null, original, corrected: outcome.corrected, final, language, mode, durationMs: meta.durationMs, provider: tr.provider, model: tr.model, audioPath: keptAudio, startedAt })
      this.finishSuccess(sess, {
        id: sessionId,
        original,
        corrected: outcome.corrected,
        final,
        language,
        languageSource: detection.source,
        engineProbability: detection.engineProbability,
        segments: detection.segments,
        mode,
        correctionStatus: outcome.status,
        durationMs: meta.durationMs,
        target
      })
    } catch (e) {
      if (sess.abort.signal.aborted && this.session !== sess) return
      const err = e instanceof SpeechError ? e : new SpeechError('unknown', (e as Error).message)
      log.error('Dictation failed', { code: err.code, message: err.message })
      await this.record(sess, { status: 'error', error: err.code, original, corrected: null, final: original, language, mode, durationMs: meta.durationMs, provider: 'unknown', model: null, audioPath: null, startedAt }).catch(() => undefined)
      this.fail(err.code, err.message)
    } finally {
      if (!keptAudio) await rm(wavPath, { force: true }).catch(() => undefined)
    }
  }

  private finishSuccess(sess: Session, result: DictationResult) {
    if (this.session !== sess) return
    this.session = null
    this.set({ phase: 'success', language: result.language })
    this.emit('result', result)
    this.emit('ended', sess.id)
    this.scheduleIdle(this.t.successHoldMs, sess.id)
  }

  private async record(
    sess: Session,
    r: { status: 'success' | 'error' | 'command'; error: string | null; original: string; corrected: string | null; final: string; language: string | null; mode: ProcessingMode; durationMs: number; provider: string; model: string | null; audioPath: string | null; startedAt: number }
  ) {
    try {
      await this.d.history.insert({
        id: sess.id,
        startedAt: r.startedAt,
        durationMs: Math.round(r.durationMs),
        language: r.language,
        languageSource: null,
        speechProvider: r.provider,
        speechModel: r.model,
        mode: r.mode,
        originalText: r.original,
        correctedText: r.corrected,
        finalText: r.final,
        status: r.status,
        error: r.error,
        target: sess.resolvedTarget ?? 'external',
        wordCount: r.status === 'success' ? countWords(r.final) : 0,
        audioPath: r.audioPath,
        documentId: null
      })
    } catch (e) {
      log.error('Could not save dictation history', e)
    }
  }

  async pasteLast(): Promise<boolean> {
    const last = await this.d.history.latestSuccessful()
    if (!last?.finalText) return false
    if (this.d.output.editorFocused()) {
      this.d.output.insertIntoEditor(last.finalText, last.id)
      return true
    }
    return (await this.d.output.insertExternal(last.finalText)).ok
  }

  async reprocess(id: string, mode: ProcessingMode): Promise<{ ok: boolean; text?: string; error?: string }> {
    const rec = await this.d.history.get(id)
    if (!rec) return { ok: false, error: 'Not found' }
    const dictionary = await this.d.dictionary()
    const out = await this.d.processor.process(applyDictionary(rec.originalText, dictionary, rec.language).text, mode, rec.language, dictionary)
    if (out.status === 'failed' || out.status === 'not-configured') return { ok: false, error: out.error }
    await this.d.history.update(id, { correctedText: out.corrected, finalText: out.final, mode })
    return { ok: true, text: out.final }
  }
}
