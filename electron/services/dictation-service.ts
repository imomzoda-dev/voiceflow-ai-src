/**
 * Dictation orchestrator — one state machine for the global hotkey, the record buttons and the editor:
 *
 *   IDLE → (SELECTING: choose one of your 3 languages, ← → / auto after N s) → RECORDING
 *        → PROCESSING → (CORRECTING) → INSERTING → SUCCESS → IDLE
 *
 * Live typing: while RECORDING the recorder cuts the audio at each pause and sends the phrase;
 * phrases are recognised and inserted one after another (in order) while the user keeps speaking.
 * The whole text is also left on the clipboard, so nothing is lost when no text field had focus.
 *
 * Guards: single session, late audio from cancelled sessions ignored, max duration, recorder
 * watchdogs, accidental taps ignored in hold mode, abortable recognition/AI calls.
 */
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { writeFile, rm, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppSettings } from '../../shared/settings'
import type { DictationErrorCode, DictationResult, DictationState, DictationTarget, ProcessingMode, VoiceCommandPayload } from '../../shared/types'
import { applyDictionary, buildVocabularyPrompt, type DictionaryEntry } from '../../shared/dictionary'
import { chooseAllowedLanguage, detectLanguages, type DetectionSource, type LanguageSegment } from '../../shared/language-detect'
import { parseVoiceCommand } from '../../shared/voice-commands'
import { SpeechError, type SpeechProvider } from './speech/types'
import type { TextProcessor } from './ai/text-processor'
import type { DictationsRepository } from '../db/dictations-repo'
import { countWords } from '../db/documents-repo'
import { createLogger } from '../main/logger'

const log = createLogger('dictation')

export interface RecorderPort {
  start(cmd: { sessionId: string; deviceId: string | null; gain: number; maxDurationSec: number; autoStopOnSilence: boolean; silenceTimeoutSec: number; live: boolean }): void
  stop(sessionId: string): void
  cancel(sessionId: string): void
}

export interface OutputPort {
  /** True when the VoiceFlow editor currently has focus (main window focused + editor focused). */
  editorFocused(): boolean
  insertIntoEditor(text: string, resultId: string): void
  commandEditor(command: VoiceCommandPayload, resultId: string): void
  insertExternal(text: string, opts: { restoreClipboard: boolean }): Promise<{ ok: boolean; error?: string }>
  copyText(text: string): Promise<void>
}

export type PrewarmableSpeech = SpeechProvider & { prewarm?: () => void }

export interface DictationDeps {
  settings: () => AppSettings
  recorder: RecorderPort
  output: OutputPort
  speech: () => Promise<PrewarmableSpeech>
  processor: Pick<TextProcessor, 'process'>
  dictionary: () => Promise<DictionaryEntry[]>
  history: Pick<DictationsRepository, 'insert' | 'update' | 'get' | 'latestSuccessful'>
  dirs: { temp: string; audio: string }
  /** Pre-flight check so we can fail before recording (e.g. model missing). */
  preflight: () => Promise<{ ok: true } | { ok: false; code: DictationErrorCode; message: string }>
  /** Whether the dictation key is physically held right now (hold-to-talk vs press-to-toggle). */
  isDictateHeld?: () => boolean
  timings?: Partial<{ successHoldMs: number; errorHoldMs: number; recorderReadyTimeoutMs: number; audioTimeoutMs: number }>
}

interface Part {
  original: string
  corrected: string | null
  final: string
  status: DictationResult['correctionStatus']
  command?: VoiceCommandPayload
}

interface Session {
  id: string
  createdAt: number
  startedAt: number
  activation: 'hold' | 'toggle' | 'manual'
  target: DictationTarget
  resolvedTarget: Exclude<DictationTarget, 'auto'> | null
  abort: AbortController
  timers: NodeJS.Timeout[]
  pickTimer: NodeJS.Timeout | null
  ready: boolean
  /** Language chosen in the picker (forced for every phrase), or null = settings decide. */
  language: string | null
  /** Hold-to-talk: released key stops. Otherwise the next press stops. */
  holdMode: boolean
  queue: Promise<void>
  parts: Part[]
  segments: LanguageSegment[]
  languageSource: DetectionSource
  engineProbability?: number
  detected: string | null
  durationMs: number
  provider: string
  model: string | null
  insertFailed: string | null
  audioFiles: string[]
  finished: boolean
  /** Any phrase had real sound in it (otherwise the microphone is probably muted). */
  heardAudio: boolean
  finalArrived: boolean
  finalTimer: NodeJS.Timeout | null
}

/** Joins phrases the way they were inserted: a space between them unless the next starts with punctuation. */
export function joinPhrases(parts: string[]): string {
  let out = ''
  for (const p of parts) {
    const t = p.trim()
    if (!t) continue
    out = out && !/^[.,;:!?…)»"'’]/.test(t) ? `${out} ${t}` : out + t
  }
  return out
}

/** Your languages in picker order: the default first, then the others (max 3, no duplicates). */
export function pickerLanguages(s: AppSettings): string[] {
  const out: string[] = []
  for (const l of [s.recognition.language, ...s.recognition.allowedLanguages]) if (l && !out.includes(l)) out.push(l)
  return out.slice(0, 3)
}

export class DictationService extends EventEmitter {
  private state: DictationState
  private session: Session | null = null
  private resetTimer: NodeJS.Timeout | null = null
  private readonly t: Required<NonNullable<DictationDeps['timings']>>

  constructor(private readonly d: DictationDeps) {
    super()
    // Settings may not be loaded yet when the service is constructed; read them lazily.
    this.state = { phase: 'idle', sessionId: null, startedAt: null, language: null, mode: 'correct', message: null, errorCode: null, activation: 'hold', maxDurationSec: 120, pickLanguages: [], pickIndex: 0, pickDeadline: null, pickSeconds: 2, liveText: '', copied: false }
    this.t = { successHoldMs: 1600, errorHoldMs: 3500, recorderReadyTimeoutMs: 5000, audioTimeoutMs: 15000, ...d.timings }
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

  isSelecting(): boolean {
    return this.state.phase === 'selecting'
  }

  isBusy(): boolean {
    return ['selecting', 'recording', 'processing', 'correcting', 'inserting'].includes(this.state.phase)
  }

  private set(patch: Partial<DictationState>) {
    this.state = { ...this.state, ...patch }
    this.emit('state', this.state)
  }

  private clearSessionTimers(sess = this.session) {
    if (!sess) return
    for (const t of sess.timers) clearTimeout(t)
    sess.timers = []
    if (sess.finalTimer) clearTimeout(sess.finalTimer)
    sess.finalTimer = null
    if (sess.pickTimer) clearTimeout(sess.pickTimer)
    sess.pickTimer = null
  }

  private scheduleIdle(ms: number, sessionId: string | null) {
    if (this.resetTimer) clearTimeout(this.resetTimer)
    this.resetTimer = setTimeout(() => {
      if (this.state.sessionId === sessionId && !this.isBusy()) {
        this.set({ phase: 'idle', sessionId: null, startedAt: null, message: null, errorCode: null, language: null, pickDeadline: null, liveText: '', copied: false })
      }
    }, ms)
  }

  private fail(code: DictationErrorCode, message: string) {
    const id = this.session?.id ?? this.state.sessionId
    this.clearSessionTimers()
    this.session?.abort.abort()
    this.session = null
    this.set({ phase: 'error', errorCode: code, message, pickDeadline: null })
    this.emit('ended', id)
    this.scheduleIdle(this.t.errorHoldMs, id)
  }

  /* ---------------------------------- start ---------------------------------- */

  async start(opts: { activation?: 'hold' | 'toggle' | 'manual'; target?: DictationTarget } = {}): Promise<{ ok: boolean; error?: string }> {
    if (this.isSelecting()) {
      this.confirmPick()
      return { ok: true }
    }
    if (this.isBusy()) return { ok: false, error: 'busy' }
    if (this.resetTimer) clearTimeout(this.resetTimer)
    const s = this.d.settings()
    const pre = await this.d.preflight()
    const id = randomUUID()
    if (!pre.ok) {
      this.set({ phase: 'error', sessionId: id, errorCode: pre.code, message: pre.message, mode: s.writing.mode, liveText: '', copied: false })
      this.emit('ended', id)
      this.scheduleIdle(this.t.errorHoldMs, id)
      return { ok: false, error: pre.code }
    }
    if (this.isBusy()) return { ok: false, error: 'busy' } // re-check after await
    // Load the speech model in the background while the user picks a language.
    void this.d
      .speech()
      .then((p) => p.prewarm?.())
      .catch(() => undefined)
    const activation = opts.activation ?? s.voice.activationMode
    const sess: Session = {
      id,
      createdAt: Date.now(),
      startedAt: Date.now(),
      activation,
      target: opts.target ?? 'auto',
      resolvedTarget: null,
      abort: new AbortController(),
      timers: [],
      pickTimer: null,
      ready: false,
      language: null,
      holdMode: false,
      queue: Promise.resolve(),
      parts: [],
      segments: [],
      languageSource: 'engine',
      detected: null,
      durationMs: 0,
      provider: 'unknown',
      model: null,
      insertFailed: null,
      audioFiles: [],
      finished: false,
      heardAudio: false,
      finalArrived: false,
      finalTimer: null
    }
    this.session = sess
    const langs = pickerLanguages(s)
    if (s.voice.languagePicker && langs.length > 1) {
      this.set({
        phase: 'selecting',
        sessionId: id,
        startedAt: null,
        language: langs[0],
        mode: s.writing.mode,
        message: null,
        errorCode: null,
        activation,
        maxDurationSec: s.voice.maxDurationSec,
        pickLanguages: langs,
        pickIndex: 0,
        pickSeconds: s.voice.pickerSeconds,
        pickDeadline: Date.now() + s.voice.pickerSeconds * 1000,
        liveText: '',
        copied: false
      })
      this.emit('started', id)
      this.armPickTimer(sess)
      return { ok: true }
    }
    const fixed = s.voice.languagePicker && langs.length === 1 ? langs[0] : s.recognition.languageMode === 'single' ? s.recognition.language : null
    this.emit('started', id)
    this.beginRecording(sess, fixed)
    return { ok: true }
  }

  private armPickTimer(sess: Session) {
    if (sess.pickTimer) clearTimeout(sess.pickTimer)
    const ms = Math.max(0, (this.state.pickDeadline ?? Date.now()) - Date.now())
    sess.pickTimer = setTimeout(() => {
      if (this.session === sess && this.state.phase === 'selecting') this.confirmPick()
    }, ms)
  }

  /** ← / → in the picker. Each move restarts the countdown so the user is never cut off mid-choice. */
  movePick(delta: number) {
    const sess = this.session
    if (!sess || this.state.phase !== 'selecting') return
    const n = this.state.pickLanguages.length
    const i = (((this.state.pickIndex + delta) % n) + n) % n
    this.set({ pickIndex: i, language: this.state.pickLanguages[i], pickDeadline: Date.now() + this.state.pickSeconds * 1000 })
    this.armPickTimer(sess)
  }

  /** Mouse click on a language chip: choose it and start. */
  choosePick(index: number) {
    if (this.state.phase !== 'selecting' || index < 0 || index >= this.state.pickLanguages.length) return
    this.set({ pickIndex: index, language: this.state.pickLanguages[index] })
    this.confirmPick()
  }

  confirmPick() {
    const sess = this.session
    if (!sess || this.state.phase !== 'selecting') return
    this.beginRecording(sess, this.state.pickLanguages[this.state.pickIndex] ?? null)
  }

  private beginRecording(sess: Session, language: string | null) {
    const s = this.d.settings()
    this.clearSessionTimers(sess)
    sess.language = language
    sess.startedAt = Date.now()
    sess.holdMode = sess.activation === 'hold' && (this.d.isDictateHeld?.() ?? false)
    // Decide where text goes when the user starts speaking (live phrases are inserted right away).
    sess.resolvedTarget = sess.target === 'auto' ? (this.d.output.editorFocused() ? 'editor' : 'external') : sess.target
    this.set({ phase: 'recording', sessionId: sess.id, startedAt: sess.startedAt, language, pickDeadline: null, mode: s.writing.mode, activation: sess.activation, maxDurationSec: s.voice.maxDurationSec, liveText: '', copied: false })
    this.d.recorder.start({
      sessionId: sess.id,
      deviceId: s.voice.microphoneId,
      gain: s.voice.inputGain,
      maxDurationSec: s.voice.maxDurationSec,
      autoStopOnSilence: s.voice.autoStopOnSilence,
      silenceTimeoutSec: s.voice.silenceTimeoutSec,
      live: s.voice.liveTyping
    })
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
  }

  recorderReady(sessionId: string) {
    if (this.session?.id === sessionId) this.session.ready = true
  }

  /* ---------------------------------- hotkey ---------------------------------- */

  /** Dictation key pressed: pick → record → stop, depending on where we are. */
  async onKeyPress(): Promise<void> {
    if (this.state.phase === 'selecting') return this.confirmPick()
    if (this.state.phase === 'recording') return this.stop()
    if (!this.isBusy()) await this.start({ activation: this.d.settings().voice.activationMode })
  }

  /** Dictation key released: stops only a hold-to-talk recording. */
  onKeyRelease() {
    if (this.state.phase === 'recording' && this.session?.holdMode) void this.stop()
  }

  async stop(): Promise<void> {
    const sess = this.session
    if (!sess) return
    if (this.state.phase === 'selecting') return this.cancel()
    if (this.state.phase !== 'recording') return
    const s = this.d.settings()
    if (sess.holdMode && Date.now() - sess.startedAt < s.voice.minHoldMs) {
      this.d.recorder.cancel(sess.id)
      this.fail('too-short', 'Hold the key while speaking')
      return
    }
    this.clearSessionTimers(sess)
    this.set({ phase: 'processing' })
    this.d.recorder.stop(sess.id)
    // Watchdog for the recorder only: it must deliver the last audio quickly. Recognition itself
    // may take as long as the engine needs (slow CPUs, large models) and is NOT covered by this.
    sess.finalTimer = setTimeout(() => {
      if (this.session === sess && !sess.finalArrived) this.fail('recorder-failed', 'The recorder did not deliver the audio')
    }, this.t.audioTimeoutMs)
  }

  async toggle(opts: { target?: DictationTarget } = {}) {
    if (this.state.phase === 'selecting') this.confirmPick()
    else if (this.state.phase === 'recording') await this.stop()
    else if (!this.isBusy()) await this.start({ activation: 'toggle', ...opts })
  }

  cancel() {
    const sess = this.session
    if (!sess) return
    this.clearSessionTimers(sess)
    sess.abort.abort()
    this.d.recorder.cancel(sess.id)
    this.session = null
    this.set({ phase: 'idle', sessionId: null, startedAt: null, message: null, errorCode: null, language: null, pickDeadline: null, liveText: '', copied: false })
    this.emit('ended', sess.id)
  }

  recorderError(sessionId: string, code: 'mic-unavailable' | 'mic-permission' | 'no-audio', message: string) {
    if (this.session?.id !== sessionId) return
    this.fail(code, message)
  }

  /* ------------------------------ audio segments ------------------------------ */

  /** A phrase (live typing) or the whole recording arrives from the recorder window. Processed strictly in order. */
  async receiveAudio(sessionId: string, wav: Buffer, meta: { durationMs: number; peak: number; rms: number; index?: number; final?: boolean }): Promise<void> {
    const sess = this.session
    if (!sess || sess.id !== sessionId || !['recording', 'processing', 'correcting', 'inserting'].includes(this.state.phase)) {
      log.debug('Ignoring audio for inactive session')
      return
    }
    const final = meta.final ?? true
    if (final) {
      sess.finalArrived = true
      if (sess.finalTimer) clearTimeout(sess.finalTimer)
    }
    const index = meta.index ?? 0
    const run = sess.queue.then(async () => {
      if (this.session !== sess) return
      await this.processSegment(sess, wav, { ...meta, index })
      if (final && this.session === sess) await this.finish(sess)
    })
    sess.queue = run.catch((e) => {
      if (this.session !== sess) return
      const err = e instanceof SpeechError ? e : new SpeechError('unknown', (e as Error).message)
      log.error('Dictation failed', { code: err.code, message: err.message })
      void this.record(sess, 'error', err.code)
      this.fail(err.code, err.message)
    })
    await sess.queue
  }

  private async processSegment(sess: Session, wav: Buffer, meta: { durationMs: number; peak: number; index: number }) {
    sess.durationMs += meta.durationMs
    // Silence between phrases (or an empty tail) is not sent to the engine.
    if (meta.durationMs < 250 || meta.peak < 0.012) return
    sess.heardAudio = true
    const s = this.d.settings()
    const wavPath = join(this.d.dirs.temp, `${sess.id}-${meta.index}.wav`)
    let kept = false
    try {
      await writeFile(wavPath, wav)
      const speech = await this.d.speech()
      const dictionary = await this.d.dictionary()
      const rec = s.recognition
      const forced = sess.language
      let tr = await speech.transcribe({ wavPath, wav, language: forced, prompt: buildVocabularyPrompt(dictionary, forced), signal: sess.abort.signal, durationMs: meta.durationMs })
      if (!forced && rec.languageMode === 'multiple' && rec.allowedLanguages.length && speech.getCapabilities().forcedLanguage) {
        const pick = chooseAllowedLanguage(tr.text, tr.language, rec.allowedLanguages)
        if (pick && pick !== tr.language) {
          log.info('Detected language outside your languages; re-running', { detected: tr.language, forced: pick })
          tr = await speech.transcribe({ wavPath, wav, language: pick, prompt: buildVocabularyPrompt(dictionary, pick), signal: sess.abort.signal, durationMs: meta.durationMs })
          tr.language = pick
        }
      }
      if (this.session !== sess) return
      sess.provider = tr.provider
      sess.model = tr.model
      const original = tr.text.trim()
      if (!original) return
      const detection = forced ? { language: forced, source: 'user' as const, segments: [{ text: original, language: forced }], engineProbability: undefined } : detectLanguages(original, { language: tr.language, probability: tr.probability })
      sess.detected ??= detection.language
      sess.languageSource = detection.source
      sess.engineProbability ??= detection.engineProbability
      sess.segments.push(...detection.segments)
      if (!this.state.language) this.set({ language: detection.language })
      const target = sess.resolvedTarget ?? 'external'
      const recording = this.state.phase === 'recording'

      // Voice commands (editor only, whole phrase), before any AI call.
      if (target === 'editor' && s.voice.voiceCommands) {
        const cmd = parseVoiceCommand(original)
        if (cmd) {
          this.d.output.commandEditor(cmd, sess.id)
          sess.parts.push({ original, corrected: null, final: '', status: 'skipped', command: cmd })
          return
        }
      }

      const language = detection.language
      const withDict = applyDictionary(original, dictionary, language).text
      if (!recording && s.writing.mode !== 'raw') this.set({ phase: 'correcting' })
      const outcome = await this.d.processor.process(withDict, s.writing.mode, language, dictionary, sess.abort.signal)
      if (this.session !== sess) return
      if (outcome.status === 'failed' && !s.writing.fallbackToRaw) throw new SpeechError(outcome.errorCode ?? 'provider-error', outcome.error ?? 'Correction failed')
      const final = applyDictionary(outcome.final, dictionary, language).text
      if (!final) return
      if (this.state.phase !== 'recording') this.set({ phase: 'inserting', message: outcome.status === 'failed' || outcome.status === 'not-configured' ? (outcome.error ?? null) : null })

      const previous = joinPhrases(sess.parts.map((p) => p.final))
      if (!s.voice.liveTyping) {
        // Not live: collect the phrases, insert the whole text once the dictation ends.
      } else if (target === 'editor') this.d.output.insertIntoEditor(final, sess.id)
      else if (target === 'external') {
        const prefix = previous && !/^[.,;:!?…)»"'’]/.test(final) ? ' ' : ''
        const r = await this.d.output.insertExternal(prefix + final, { restoreClipboard: !s.voice.keepInClipboard })
        if (!r.ok) sess.insertFailed = r.error ?? 'insert-failed'
      }
      sess.parts.push({ original, corrected: outcome.corrected, final, status: outcome.status })
      const all = joinPhrases(sess.parts.map((p) => p.final))
      this.set({ liveText: all.length > 140 ? `…${all.slice(-140)}` : all })
      if (s.storage.saveAudio) {
        const dest = join(this.d.dirs.audio, `${sess.id}-${meta.index}.wav`)
        await rename(wavPath, dest).then(
          () => {
            kept = true
            sess.audioFiles.push(dest)
          },
          () => undefined
        )
      }
    } finally {
      if (!kept) await rm(wavPath, { force: true }).catch(() => undefined)
    }
  }

  private async finish(sess: Session) {
    if (sess.finished || this.session !== sess) return
    sess.finished = true
    this.clearSessionTimers(sess)
    const s = this.d.settings()
    const textParts = sess.parts.filter((p) => !p.command)
    if (!sess.parts.length) {
      await this.record(sess, 'error', 'empty-transcript')
      if (sess.heardAudio) this.fail('empty-transcript', 'Nothing was recognised')
      else this.fail('no-audio', 'No speech was detected — check the microphone')
      return
    }
    const final = joinPhrases(textParts.map((p) => p.final))
    const original = joinPhrases(sess.parts.map((p) => p.original))
    if (!s.voice.liveTyping && final) {
      if (sess.resolvedTarget === 'editor') this.d.output.insertIntoEditor(final, sess.id)
      else if (sess.resolvedTarget === 'external') {
        const r = await this.d.output.insertExternal(final, { restoreClipboard: !s.voice.keepInClipboard })
        if (!r.ok) sess.insertFailed = r.error ?? 'insert-failed'
      }
    }
    let copied = false
    if (final && (s.voice.keepInClipboard || sess.insertFailed) && sess.resolvedTarget !== 'editor') {
      await this.d.output.copyText(final).then(
        () => (copied = true),
        () => undefined
      )
    }
    await this.record(sess, textParts.length ? 'success' : 'command', null)
    const statuses = textParts.map((p) => p.status)
    const correctionStatus: DictationResult['correctionStatus'] = statuses.includes('failed') ? 'failed' : statuses.includes('rejected-unsafe') ? 'rejected-unsafe' : statuses.includes('applied') ? 'applied' : statuses.includes('not-configured') ? 'not-configured' : 'skipped'
    const result: DictationResult = {
      id: sess.id,
      original,
      corrected: textParts.some((p) => p.corrected) ? joinPhrases(textParts.map((p) => p.corrected ?? p.final)) : null,
      final,
      language: sess.detected ?? sess.language,
      languageSource: sess.language ? 'user' : sess.languageSource,
      engineProbability: sess.engineProbability,
      segments: sess.segments,
      mode: s.writing.mode,
      correctionStatus,
      durationMs: sess.durationMs,
      target: sess.resolvedTarget ?? 'external',
      command: sess.parts.length === 1 ? sess.parts[0].command : undefined
    }
    this.session = null
    this.set({ phase: 'success', language: result.language, copied, message: sess.insertFailed ? 'insert-failed' : null })
    this.emit('result', result)
    this.emit('ended', sess.id)
    this.scheduleIdle(this.t.successHoldMs, sess.id)
  }

  private async record(sess: Session, status: 'success' | 'error' | 'command', error: string | null) {
    const textParts = sess.parts.filter((p) => !p.command)
    const final = joinPhrases(textParts.map((p) => p.final))
    try {
      await this.d.history.insert({
        id: sess.id,
        startedAt: sess.createdAt,
        durationMs: Math.round(sess.durationMs),
        language: sess.detected ?? sess.language,
        languageSource: sess.language ? 'user' : sess.languageSource,
        speechProvider: sess.provider,
        speechModel: sess.model,
        mode: this.d.settings().writing.mode,
        originalText: joinPhrases(sess.parts.map((p) => p.original)),
        correctedText: textParts.some((p) => p.corrected) ? joinPhrases(textParts.map((p) => p.corrected ?? p.final)) : null,
        finalText: final,
        status,
        error,
        target: sess.resolvedTarget ?? 'external',
        wordCount: status === 'success' ? countWords(final) : 0,
        audioPath: sess.audioFiles[0] ?? null,
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
    return (await this.d.output.insertExternal(last.finalText, { restoreClipboard: !this.d.settings().voice.keepInClipboard })).ok
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
