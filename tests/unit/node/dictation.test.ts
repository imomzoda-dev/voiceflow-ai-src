import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DictationService, type DictationDeps } from '../../../electron/services/dictation-service'
import { DEFAULT_SETTINGS, type AppSettings } from '../../../shared/settings'
import type { SpeechProvider, TranscriptionResult } from '../../../electron/services/speech/types'
import { SpeechError } from '../../../electron/services/speech/types'
import { encodeWav } from '../../../shared/audio'

const wav = () => Buffer.from(encodeWav(new Float32Array(16000).map((_, i) => Math.sin(i / 10) * 0.4)))
const tick = () => new Promise((r) => setTimeout(r, 5))

function setup(over: { settings?: Partial<AppSettings>; transcript?: Partial<TranscriptionResult> | Error; processor?: DictationDeps['processor']; editorFocused?: boolean; preflight?: Awaited<ReturnType<DictationDeps['preflight']>>; held?: () => boolean; slowMs?: number } = {}) {
  const settings: AppSettings = structuredClone({ ...DEFAULT_SETTINGS, ...over.settings })
  settings.voice.minHoldMs = 0
  settings.voice.languagePicker = false
  settings.recognition.languageMode = 'auto'
  const recorder = { start: vi.fn(), stop: vi.fn(), cancel: vi.fn() }
  const output = {
    editorFocused: vi.fn(() => over.editorFocused ?? false),
    insertIntoEditor: vi.fn(),
    commandEditor: vi.fn(),
    insertExternal: vi.fn(async (_t: string, _o: { restoreClipboard: boolean }) => ({ ok: true }) as { ok: boolean; error?: string }),
    copyText: vi.fn(async (_t: string) => {})
  }
  const transcribe = vi.fn(async (): Promise<TranscriptionResult> => {
    if (over.slowMs) await new Promise((r) => setTimeout(r, over.slowMs))
    if (over.transcript instanceof Error) throw over.transcript
    return { text: 'привет мир', language: 'ru', provider: 'whisper-cpp', model: 'base', ...over.transcript }
  })
  const speech: SpeechProvider = {
    id: 'whisper-cpp',
    displayName: 'w',
    initialize: async () => {},
    transcribe,
    getSupportedLanguages: () => 'any',
    getCapabilities: () => ({ local: true, languageDetection: true, vocabularyPrompt: true, forcedLanguage: true, streaming: false }),
    dispose: async () => {}
  }
  const history = { insert: vi.fn(async () => {}), update: vi.fn(async () => {}), get: vi.fn(async () => null), latestSuccessful: vi.fn(async () => null) }
  const dir = mkdtempSync(join(tmpdir(), 'vf-dict-'))
  const svc = new DictationService({
    settings: () => settings,
    recorder,
    output,
    speech: async () => speech,
    processor: over.processor ?? { process: vi.fn(async (t: string) => ({ final: `${t[0].toUpperCase()}${t.slice(1)}.`, corrected: `${t[0].toUpperCase()}${t.slice(1)}.`, status: 'applied' as const })) },
    dictionary: async () => [],
    history: history as unknown as DictationDeps['history'],
    dirs: { temp: dir, audio: dir },
    preflight: async () => over.preflight ?? { ok: true },
    isDictateHeld: over.held ?? (() => true),
    timings: { successHoldMs: 20, errorHoldMs: 20, recorderReadyTimeoutMs: 2000, audioTimeoutMs: over.slowMs ? 60 : 2000 }
  })
  const phases: string[] = []
  svc.on('state', (s) => phases.push(s.phase))
  return { svc, recorder, output, transcribe, history, phases, settings }
}

async function speak(svc: DictationService, recorder: { start: ReturnType<typeof vi.fn> }) {
  await svc.start({ activation: 'hold' })
  const id = recorder.start.mock.calls[0][0].sessionId as string
  svc.recorderReady(id)
  await svc.stop()
  await svc.receiveAudio(id, wav(), { durationMs: 1000, peak: 0.4, rms: 0.2 })
  return id
}

describe('DictationService', () => {
  beforeEach(() => vi.useRealTimers())

  it('runs RECORDING → PROCESSING → CORRECTING → INSERTING → SUCCESS → IDLE and pastes into the active app', async () => {
    const { svc, recorder, output, phases, history } = setup()
    await speak(svc, recorder)
    expect(output.insertExternal).toHaveBeenCalledWith('Привет мир.', { restoreClipboard: false })
    // 'processing' is emitted twice: once on stop, once when the detected language is known.
    expect([...new Set(phases)]).toEqual(['recording', 'processing', 'correcting', 'inserting', 'success'])
    expect(history.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', originalText: 'привет мир', finalText: 'Привет мир.', language: 'ru' }))
    await new Promise((r) => setTimeout(r, 40))
    expect(svc.getState().phase).toBe('idle')
  })

  it('inserts into the editor when it has focus', async () => {
    const { svc, recorder, output } = setup({ editorFocused: true })
    await speak(svc, recorder)
    expect(output.insertIntoEditor).toHaveBeenCalledWith('Привет мир.', expect.any(String))
    expect(output.insertExternal).not.toHaveBeenCalled()
  })

  it('ignores a second start while busy (double press protection)', async () => {
    const { svc, recorder } = setup()
    await svc.start()
    expect((await svc.start()).ok).toBe(false)
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it('cancel stops the recorder and ignores late audio', async () => {
    const { svc, recorder, transcribe } = setup()
    await svc.start()
    const id = recorder.start.mock.calls[0][0].sessionId
    svc.cancel()
    expect(recorder.cancel).toHaveBeenCalledWith(id)
    expect(svc.getState().phase).toBe('idle')
    await svc.receiveAudio(id, wav(), { durationMs: 1000, peak: 0.5, rms: 0.2 })
    expect(transcribe).not.toHaveBeenCalled()
  })

  it('treats very short holds as accidental taps', async () => {
    const { svc, recorder, settings } = setup()
    settings.voice.minHoldMs = 10_000
    await svc.start({ activation: 'hold' })
    await svc.stop()
    expect(recorder.cancel).toHaveBeenCalled()
    expect(svc.getState()).toMatchObject({ phase: 'error', errorCode: 'too-short' })
  })

  it('toggle mode: first call starts, second stops', async () => {
    const { svc, recorder } = setup()
    await svc.toggle()
    expect(svc.getState().phase).toBe('recording')
    await svc.toggle()
    expect(recorder.stop).toHaveBeenCalled()
    expect(svc.getState().phase).toBe('processing')
  })

  it('fails before recording when the model is missing (no silent recording)', async () => {
    const { svc, recorder } = setup({ preflight: { ok: false, code: 'model-missing', message: 'x' } })
    const r = await svc.start()
    expect(r).toEqual({ ok: false, error: 'model-missing' })
    expect(recorder.start).not.toHaveBeenCalled()
    expect(svc.getState().errorCode).toBe('model-missing')
  })

  it('reports silence instead of sending it to the engine', async () => {
    const { svc, recorder, transcribe } = setup()
    await svc.start()
    const id = recorder.start.mock.calls[0][0].sessionId
    await svc.stop()
    await svc.receiveAudio(id, wav(), { durationMs: 2000, peak: 0.001, rms: 0.0005 })
    expect(transcribe).not.toHaveBeenCalled()
    expect(svc.getState().errorCode).toBe('no-audio')
  })

  it('surfaces API errors with their code and records them in history', async () => {
    const { svc, recorder, history } = setup({ transcript: new SpeechError('invalid-key', 'HTTP 401') })
    await speak(svc, recorder)
    expect(svc.getState()).toMatchObject({ phase: 'error', errorCode: 'invalid-key' })
    expect(history.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', error: 'invalid-key' }))
  })

  it('falls back to the raw transcript when AI correction fails', async () => {
    const processor = { process: vi.fn(async (t: string) => ({ final: t, corrected: null, status: 'failed' as const, error: 'down', errorCode: 'network' as const })) }
    const { svc, recorder, output } = setup({ processor })
    await speak(svc, recorder)
    expect(output.insertExternal).toHaveBeenCalledWith('привет мир', { restoreClipboard: false })
    expect(svc.getState().phase).toBe('success')
  })

  it('runs voice commands in the editor instead of inserting text', async () => {
    const { svc, recorder, output } = setup({ editorFocused: true, transcript: { text: 'Новый абзац.' } })
    await speak(svc, recorder)
    expect(output.commandEditor).toHaveBeenCalledWith({ kind: 'editor', command: 'newParagraph' }, expect.any(String))
    expect(output.insertIntoEditor).not.toHaveBeenCalled()
  })

  it('re-runs with a forced allowed language when the engine detects one outside the set', async () => {
    const { svc, recorder, transcribe, settings } = setup({ transcript: { text: 'салом дӯстон', language: 'fa' } })
    settings.recognition.languageMode = 'multiple'
    settings.recognition.allowedLanguages = ['tg', 'ru']
    await speak(svc, recorder)
    expect(transcribe).toHaveBeenCalledTimes(2)
    expect((transcribe.mock.calls as unknown as [{ language: string }][])[1][0]).toMatchObject({ language: 'tg' })
  })

  it('stops automatically at the maximum duration', async () => {
    vi.useFakeTimers()
    const { svc, recorder, settings } = setup()
    settings.voice.maxDurationSec = 5
    await svc.start()
    svc.recorderReady(recorder.start.mock.calls[0][0].sessionId)
    vi.advanceTimersByTime(5100)
    await tick
    expect(recorder.stop).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('language picker: shows your three languages, arrows move, the countdown starts recording in the chosen one', async () => {
    vi.useFakeTimers()
    const { svc, recorder, transcribe, settings } = setup()
    settings.voice.languagePicker = true
    settings.voice.pickerSeconds = 2
    settings.recognition.language = 'tg'
    settings.recognition.allowedLanguages = ['tg', 'ru', 'en']
    await svc.start({ activation: 'hold' })
    expect(svc.getState()).toMatchObject({ phase: 'selecting', pickLanguages: ['tg', 'ru', 'en'], pickIndex: 0 })
    expect(recorder.start).not.toHaveBeenCalled()
    svc.movePick(1)
    expect(svc.getState().pickIndex).toBe(1)
    svc.movePick(-2) // wraps around
    expect(svc.getState().language).toBe('en')
    svc.movePick(-1)
    vi.advanceTimersByTime(1900)
    expect(svc.getState().phase).toBe('selecting')
    vi.advanceTimersByTime(200)
    expect(svc.getState()).toMatchObject({ phase: 'recording', language: 'ru' })
    expect(recorder.start).toHaveBeenCalledTimes(1)
    const id = recorder.start.mock.calls[0][0].sessionId
    svc.recorderReady(id)
    vi.advanceTimersByTime(1000)
    await svc.stop()
    vi.useRealTimers()
    await svc.receiveAudio(id, wav(), { durationMs: 1000, peak: 0.4, rms: 0.2 })
    expect((transcribe.mock.calls as unknown as [{ language: string }][])[0][0].language).toBe('ru')
  })

  it('language picker: pressing the key again starts at once; cancel closes it', async () => {
    const { svc, recorder, settings } = setup()
    settings.voice.languagePicker = true
    await svc.onKeyPress()
    expect(svc.getState().phase).toBe('selecting')
    await svc.onKeyPress()
    expect(svc.getState().phase).toBe('recording')
    svc.cancel()
    await svc.onKeyPress()
    expect(svc.getState().phase).toBe('selecting')
    svc.cancel()
    expect(svc.getState().phase).toBe('idle')
    expect(recorder.start).toHaveBeenCalledTimes(1)
  })

  it('hold vs press: a held key stops on release, a tapped key stops on the next press', async () => {
    let held = true
    const { svc, recorder } = setup({ held: () => held })
    await svc.onKeyPress()
    svc.onKeyRelease()
    expect(recorder.stop).toHaveBeenCalledTimes(1)
    svc.cancel()
    held = false
    await svc.onKeyPress()
    svc.onKeyRelease()
    expect(svc.getState().phase).toBe('recording')
    await svc.onKeyPress()
    expect(recorder.stop).toHaveBeenCalledTimes(2)
  })

  it('live typing: phrases are inserted while speaking, in order, and the whole text is left on the clipboard', async () => {
    const { svc, recorder, output, history } = setup({ transcript: { text: 'салом' } })
    await svc.start({ activation: 'toggle' })
    const id = recorder.start.mock.calls[0][0].sessionId
    svc.recorderReady(id)
    expect(recorder.start.mock.calls[0][0].live).toBe(true)
    await svc.receiveAudio(id, wav(), { durationMs: 900, peak: 0.4, rms: 0.2, index: 0, final: false })
    expect(svc.getState().phase).toBe('recording') // still listening
    expect(output.insertExternal).toHaveBeenNthCalledWith(1, 'Салом.', { restoreClipboard: false })
    expect(svc.getState().liveText).toBe('Салом.')
    await svc.stop()
    await svc.receiveAudio(id, wav(), { durationMs: 900, peak: 0.4, rms: 0.2, index: 1, final: true })
    expect(output.insertExternal).toHaveBeenNthCalledWith(2, ' Салом.', { restoreClipboard: false })
    expect(output.copyText).toHaveBeenCalledWith('Салом. Салом.')
    expect(svc.getState()).toMatchObject({ phase: 'success', copied: true })
    expect(history.insert).toHaveBeenCalledWith(expect.objectContaining({ finalText: 'Салом. Салом.', status: 'success' }))
  })

  it('a silent tail after the last phrase still finishes the dictation', async () => {
    const { svc, recorder, transcribe } = setup()
    await svc.start({ activation: 'toggle' })
    const id = recorder.start.mock.calls[0][0].sessionId
    svc.recorderReady(id)
    await svc.receiveAudio(id, wav(), { durationMs: 900, peak: 0.4, rms: 0.2, index: 0, final: false })
    await svc.stop()
    await svc.receiveAudio(id, wav(), { durationMs: 400, peak: 0.002, rms: 0.001, index: 1, final: true })
    expect(transcribe).toHaveBeenCalledTimes(1)
    expect(svc.getState().phase).toBe('success')
  })

  it('keeps the text on the clipboard even if pasting failed', async () => {
    const { svc, recorder, output, settings } = setup()
    settings.voice.keepInClipboard = false
    output.insertExternal.mockResolvedValueOnce({ ok: false, error: 'accessibility' })
    await speak(svc, recorder)
    expect(output.copyText).toHaveBeenCalledWith('Привет мир.')
    expect(svc.getState()).toMatchObject({ phase: 'success', message: 'insert-failed' })
  })

  it('a slow engine (recognition longer than the recorder watchdog) still succeeds — regression for “no speech detected”', async () => {
    const { svc, recorder, output } = setup({ slowMs: 200 })
    await speak(svc, recorder)
    expect(svc.getState().phase).toBe('success')
    expect(output.insertExternal).toHaveBeenCalledWith('Привет мир.', { restoreClipboard: false })
  })

  it('a recorder that never delivers the last audio fails with its own message, not “no speech”', async () => {
    const { svc, recorder } = setup({ slowMs: 1 })
    const errors: (string | null)[] = []
    svc.on('state', (st) => st.phase === 'error' && errors.push(st.errorCode))
    await svc.start()
    svc.recorderReady(recorder.start.mock.calls[0][0].sessionId)
    await svc.stop()
    await new Promise((r) => setTimeout(r, 120))
    expect(errors).toEqual(['recorder-failed'])
  })
})
