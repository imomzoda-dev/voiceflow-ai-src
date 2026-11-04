/** Pure audio helpers used by the recorder (and unit-tested in Node). */

export const TARGET_SAMPLE_RATE = 16000

/**
 * Downsamples mono Float32 PCM to `outRate` by box-filter averaging (acts as a simple low-pass
 * filter, avoiding aliasing from naive decimation). Upsampling uses linear interpolation.
 */
export function resample(input: Float32Array, inRate: number, outRate = TARGET_SAMPLE_RATE): Float32Array {
  if (inRate === outRate) return input.slice()
  const ratio = inRate / outRate
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  if (ratio > 1) {
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio)
      const end = Math.min(input.length, Math.floor((i + 1) * ratio))
      let sum = 0
      for (let k = start; k < end; k++) sum += input[k]
      out[i] = end > start ? sum / (end - start) : input[start] ?? 0
    }
  } else {
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio
      const k = Math.floor(pos)
      const frac = pos - k
      const a = input[k] ?? 0
      const b = input[k + 1] ?? a
      out[i] = a + (b - a) * frac
    }
  }
  return out
}

export function concatFloat32(chunks: Float32Array[]): Float32Array {
  let len = 0
  for (const c of chunks) len += c.length
  const out = new Float32Array(len)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

/** Encodes mono Float32 [-1, 1] samples as a 16-bit PCM RIFF/WAVE file. */
export function encodeWav(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE): ArrayBuffer {
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true) // PCM chunk size
  v.setUint16(20, 1, true) // PCM format
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * bytesPerSample, true)
  v.setUint16(32, bytesPerSample, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, dataSize, true)
  let o = 44
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}

export function stats(samples: Float32Array): { peak: number; rms: number } {
  let peak = 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i])
    if (a > peak) peak = a
    sum += samples[i] * samples[i]
  }
  return { peak, rms: samples.length ? Math.sqrt(sum / samples.length) : 0 }
}

/** Maps RMS to a perceptual 0..1 level for meters/waveforms. */
export function levelFromRms(rms: number): number {
  if (rms <= 0) return 0
  const db = 20 * Math.log10(rms)
  return Math.max(0, Math.min(1, (db + 60) / 50))
}

/**
 * Trims leading/trailing silence (keeps 200 ms padding) — reduces Whisper hallucinations on
 * silent tails and speeds up recognition.
 */
export function trimSilence(samples: Float32Array, sampleRate = TARGET_SAMPLE_RATE, threshold = 0.012): Float32Array {
  const win = Math.floor(sampleRate * 0.02)
  let start = 0
  let end = samples.length
  const energetic = (from: number) => {
    let sum = 0
    for (let i = from; i < Math.min(samples.length, from + win); i++) sum += samples[i] * samples[i]
    return Math.sqrt(sum / win) > threshold
  }
  while (start < samples.length && !energetic(start)) start += win
  while (end > start && !energetic(Math.max(0, end - win))) end -= win
  if (start >= end) return samples
  const pad = Math.floor(sampleRate * 0.2)
  return samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad))
}
