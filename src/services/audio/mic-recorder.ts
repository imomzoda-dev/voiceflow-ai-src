/**
 * Microphone capture → 16 kHz mono WAV. The MediaStream is opened only for the duration of a
 * recording and every track is stopped afterwards, so the OS mic indicator turns off.
 */
import workletUrl from './recorder.worklet.ts?worker&url'
import { concatFloat32, encodeWav, levelFromRms, resample, stats, trimSilence, TARGET_SAMPLE_RATE } from '@shared/audio'

export type RecorderErrorCode = 'mic-unavailable' | 'mic-permission' | 'no-audio'

export interface RecordingResult {
  wav: ArrayBuffer
  durationMs: number
  peak: number
  rms: number
  /** Position of this phrase in the dictation (0, 1, 2…). */
  index: number
}

export interface RecorderCallbacks {
  onLevel?: (level: number) => void
  onError?: (code: RecorderErrorCode, message: string) => void
  /** Fired when auto-stop-on-silence decides speech has ended. */
  onSilence?: () => void
  /** Live typing: a finished phrase (cut at a pause) while recording continues. */
  onSegment?: (segment: RecordingResult) => void
}

/** Live typing segmentation: a phrase ends after this much quiet following speech. */
const PAUSE_MS = 650
const MIN_SEGMENT_MS = 800
/**
 * Phrases never exceed this length: the engine runs Whisper with a 10-second encoder window
 * (`--audio-ctx 512`), ~4× faster on CPU than the default 30 s window with identical results.
 */
export const MAX_SEGMENT_MS = 9_500

/**
 * Chunk index after which to cut a phrase that reached the length limit without a pause: the
 * middle of the quietest ~250 ms stretch in the last SOFT_CUT_WINDOW_MS — the gap between two
 * words — rather than a single quiet chunk, which can be a soft consonant inside a word.
 */
export function quietestCut(levels: number[], chunkMs: number): number {
  const n = levels.length
  if (n < 2 || chunkMs <= 0) return Math.max(1, n)
  const run = Math.max(1, Math.round(250 / chunkMs))
  const span = Math.min(n - 1, Math.ceil(SOFT_CUT_WINDOW_MS / chunkMs))
  let best = n
  let bestLevel = Infinity
  for (let start = Math.max(1, n - span); start + run <= n; start++) {
    let sum = 0
    for (let i = start; i < start + run; i++) sum += levels[i]
    // Ties go to the later gap: the phrase stays as long as possible.
    if (sum <= bestLevel) {
      bestLevel = sum
      best = start + Math.floor(run / 2)
    }
  }
  return Math.max(1, Math.min(n, best))
}
/** When a phrase hits the limit without a pause, it is cut at the quietest moment of its last part. */
const SOFT_CUT_WINDOW_MS = 3_000
const SPEECH_LEVEL = 0.35

export class MicRecorder {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  /** Audio of the current phrase (input sample rate). */
  private chunks: Float32Array[] = []
  private levels: number[] = []
  private chunkSamples = 0
  private startedAt = 0
  private inRate = 48000
  private lastLoudAt = 0
  private heardSpeech = false
  private speechInSegment = false
  private index = 0

  constructor(private readonly cb: RecorderCallbacks = {}) {}

  get active(): boolean {
    return this.stream !== null
  }

  async start(opts: { deviceId: string | null; gain: number; autoStopOnSilence?: boolean; silenceTimeoutSec?: number; live?: boolean }): Promise<void> {
    await this.dispose()
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
    } catch (e) {
      const name = (e as DOMException).name
      if (name === 'OverconstrainedError' && opts.deviceId) {
        // The saved device was unplugged: fall back to the system default.
        return this.start({ ...opts, deviceId: null })
      }
      const code: RecorderErrorCode = name === 'NotAllowedError' || name === 'SecurityError' ? 'mic-permission' : 'mic-unavailable'
      this.cb.onError?.(code, (e as Error).message)
      throw e
    }
    for (const track of this.stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (this.stream) this.cb.onError?.('mic-unavailable', 'The microphone was disconnected')
      })
    }
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.inRate = this.ctx.sampleRate
    await this.ctx.audioWorklet.addModule(workletUrl)
    const source = this.ctx.createMediaStreamSource(this.stream)
    const gain = this.ctx.createGain()
    gain.gain.value = opts.gain
    this.node = new AudioWorkletNode(this.ctx, 'voiceflow-recorder', { numberOfInputs: 1, numberOfOutputs: 0 })
    this.chunks = []
    this.levels = []
    this.chunkSamples = 0
    this.index = 0
    this.startedAt = performance.now()
    this.lastLoudAt = this.startedAt
    this.heardSpeech = false
    this.speechInSegment = false
    const silenceMs = (opts.silenceTimeoutSec ?? 4) * 1000
    this.node.port.onmessage = (ev: MessageEvent<{ samples: Float32Array; rms: number }>) => {
      this.chunks.push(ev.data.samples)
      this.chunkSamples += ev.data.samples.length
      const level = levelFromRms(ev.data.rms)
      this.levels.push(level)
      this.cb.onLevel?.(level)
      const now = performance.now()
      if (level > SPEECH_LEVEL) {
        this.lastLoudAt = now
        this.heardSpeech = true
        this.speechInSegment = true
      } else if (opts.autoStopOnSilence && this.heardSpeech && now - this.lastLoudAt > silenceMs) {
        this.heardSpeech = false
        this.cb.onSilence?.()
      }
      // Phrases are cut at pauses (and at the length limit) in every mode; "live" only decides
      // whether the main process inserts each phrase at once or waits for the end.
      const segMs = (this.chunkSamples / this.inRate) * 1000
      const paused = this.speechInSegment && now - this.lastLoudAt >= PAUSE_MS && segMs >= MIN_SEGMENT_MS
      if (paused) this.cb.onSegment?.(this.cutSegment())
      else if (segMs >= MAX_SEGMENT_MS) this.cb.onSegment?.(this.cutSegment(this.quietestCut()))
    }
    source.connect(gain).connect(this.node)
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  /** Where to cut a phrase that reached the length limit without a pause: see `quietestCut`. */
  private quietestCut(): number {
    return quietestCut(this.levels, ((this.chunkSamples / this.inRate) * 1000) / Math.max(1, this.chunks.length))
  }

  /** Encodes the current phrase (16 kHz mono WAV, silence trimmed) and starts a new one. */
  private cutSegment(upTo = this.chunks.length): RecordingResult {
    const raw = concatFloat32(this.chunks.slice(0, upTo))
    const durationMs = (raw.length / this.inRate) * 1000
    this.chunks = this.chunks.slice(upTo)
    this.levels = this.levels.slice(upTo)
    this.chunkSamples = this.chunks.reduce((n, c) => n + c.length, 0)
    this.speechInSegment = this.levels.some((l) => l > SPEECH_LEVEL)
    const pcm = trimSilence(resample(raw, this.inRate, TARGET_SAMPLE_RATE))
    const s = stats(pcm)
    return { wav: encodeWav(pcm, TARGET_SAMPLE_RATE), durationMs, peak: s.peak, rms: s.rms, index: this.index++ }
  }

  /** Stops recording and returns the last phrase (or, without live typing, the whole recording). */
  async stop(): Promise<RecordingResult> {
    // Let the last worklet batch arrive.
    await new Promise((r) => setTimeout(r, 120))
    const result = this.cutSegment()
    await this.dispose()
    return result
  }

  async cancel(): Promise<void> {
    await this.dispose()
  }

  private async dispose() {
    if (this.node) {
      this.node.port.onmessage = null
      this.node.disconnect()
      this.node = null
    }
    if (this.stream) {
      const s = this.stream
      this.stream = null
      for (const t of s.getTracks()) t.stop()
    }
    if (this.ctx) {
      const c = this.ctx
      this.ctx = null
      await c.close().catch(() => undefined)
    }
  }
}

/** Live level meter for the settings/onboarding mic test (no recording kept). */
export async function startLevelMeter(deviceId: string | null, onLevel: (l: number) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined } })
  const ctx = new AudioContext()
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  src.connect(analyser)
  const data = new Float32Array(analyser.fftSize)
  let raf = 0
  const tick = () => {
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    onLevel(levelFromRms(Math.sqrt(sum / data.length)))
    raf = requestAnimationFrame(tick)
  }
  tick()
  return () => {
    cancelAnimationFrame(raf)
    for (const t of stream.getTracks()) t.stop()
    void ctx.close()
  }
}
