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
}

export interface RecorderCallbacks {
  onLevel?: (level: number) => void
  onError?: (code: RecorderErrorCode, message: string) => void
  /** Fired when auto-stop-on-silence decides speech has ended. */
  onSilence?: () => void
}

export class MicRecorder {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private chunks: Float32Array[] = []
  private startedAt = 0
  private inRate = 48000
  private lastLoudAt = 0
  private heardSpeech = false

  constructor(private readonly cb: RecorderCallbacks = {}) {}

  get active(): boolean {
    return this.stream !== null
  }

  async start(opts: { deviceId: string | null; gain: number; autoStopOnSilence?: boolean; silenceTimeoutSec?: number }): Promise<void> {
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
    this.startedAt = performance.now()
    this.lastLoudAt = this.startedAt
    this.heardSpeech = false
    const silenceMs = (opts.silenceTimeoutSec ?? 4) * 1000
    this.node.port.onmessage = (ev: MessageEvent<{ samples: Float32Array; rms: number }>) => {
      this.chunks.push(ev.data.samples)
      const level = levelFromRms(ev.data.rms)
      this.cb.onLevel?.(level)
      const now = performance.now()
      if (level > 0.35) {
        this.lastLoudAt = now
        this.heardSpeech = true
      } else if (opts.autoStopOnSilence && this.heardSpeech && now - this.lastLoudAt > silenceMs) {
        this.heardSpeech = false
        this.cb.onSilence?.()
      }
    }
    source.connect(gain).connect(this.node)
    if (this.ctx.state === 'suspended') await this.ctx.resume()
  }

  async stop(): Promise<RecordingResult> {
    const durationMs = performance.now() - this.startedAt
    // Let the last worklet batch arrive.
    await new Promise((r) => setTimeout(r, 120))
    const raw = concatFloat32(this.chunks)
    await this.dispose()
    const pcm = trimSilence(resample(raw, this.inRate, TARGET_SAMPLE_RATE))
    const s = stats(pcm)
    return { wav: encodeWav(pcm, TARGET_SAMPLE_RATE), durationMs, peak: s.peak, rms: s.rms }
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
