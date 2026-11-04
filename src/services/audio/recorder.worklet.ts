/// <reference lib="webworker" />
/**
 * AudioWorklet that forwards mono Float32 frames to the main thread in ~85 ms batches,
 * along with the batch RMS for the waveform. Runs on the audio rendering thread.
 */
declare const sampleRate: number
declare function registerProcessor(name: string, ctor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

class RecorderProcessor extends AudioWorkletProcessor {
  private buf: Float32Array[] = []
  private len = 0
  private readonly batch = Math.round(sampleRate * 0.085)

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    if (input && input.length) {
      const ch0 = input[0]
      let mono: Float32Array
      if (input.length > 1) {
        mono = new Float32Array(ch0.length)
        for (let c = 0; c < input.length; c++) for (let i = 0; i < ch0.length; i++) mono[i] += input[c][i] / input.length
      } else mono = new Float32Array(ch0)
      this.buf.push(mono)
      this.len += mono.length
      if (this.len >= this.batch) {
        const out = new Float32Array(this.len)
        let o = 0
        let sum = 0
        for (const b of this.buf) {
          out.set(b, o)
          o += b.length
        }
        for (let i = 0; i < out.length; i++) sum += out[i] * out[i]
        this.port.postMessage({ samples: out, rms: Math.sqrt(sum / out.length) }, [out.buffer])
        this.buf = []
        this.len = 0
      }
    }
    return true
  }
}

registerProcessor('voiceflow-recorder', RecorderProcessor)
