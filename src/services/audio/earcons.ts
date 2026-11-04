/**
 * Short, quiet interface sounds synthesised with WebAudio (no audio files, no network).
 * Start: rising two-note chime · Stop: falling note · Success: soft pop · Error: low double tap.
 */
let ctx: AudioContext | null = null

function tone(freq: number, start: number, dur: number, gain = 0.06, type: OscillatorType = 'sine') {
  ctx ??= new AudioContext()
  const t0 = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export type Earcon = 'start' | 'stop' | 'success' | 'error'

export function playEarcon(kind: Earcon) {
  try {
    if (ctx?.state === 'suspended') void ctx.resume()
    switch (kind) {
      case 'start':
        tone(880, 0, 0.09)
        tone(1318.5, 0.07, 0.14)
        break
      case 'stop':
        tone(1046.5, 0, 0.08)
        tone(698.5, 0.06, 0.14)
        break
      case 'success':
        tone(1567.98, 0, 0.12, 0.035)
        break
      case 'error':
        tone(220, 0, 0.1, 0.07, 'triangle')
        tone(196, 0.12, 0.14, 0.07, 'triangle')
        break
    }
  } catch {
    /* sound is best-effort */
  }
}
