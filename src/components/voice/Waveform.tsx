import { useEffect, useRef } from 'react'

/**
 * Canvas waveform driven by a level stream (0..1). Draws a scrolling bar history and adapts to
 * devicePixelRatio for crisp rendering on Retina / high-DPI Windows displays.
 */
export function Waveform({
  level,
  active,
  bars = 28,
  className,
  color = 'var(--accent)',
  idleMotion = false
}: {
  level: number
  active: boolean
  bars?: number
  className?: string
  color?: string
  idleMotion?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const history = useRef<number[]>(Array(bars).fill(0))
  const levelRef = useRef(level)
  levelRef.current = level

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const g = c.getContext('2d')
    if (!g) return
    let raf = 0
    let last = 0
    let phase = 0
    const resolved = getComputedStyle(c).getPropertyValue(color.replace(/^var\((.+)\)$/, '$1')).trim() || color
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 33) return // ~30 fps is enough and keeps CPU low
      last = t
      const dpr = window.devicePixelRatio || 1
      const w = c.clientWidth
      const h = c.clientHeight
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      phase += 0.12
      const next = active ? levelRef.current : idleMotion ? 0.12 + 0.1 * Math.sin(phase) : 0
      history.current.push(next)
      if (history.current.length > bars) history.current.shift()
      const gap = 3
      const bw = Math.max(2, (w - gap * (bars - 1)) / bars)
      g.fillStyle = resolved
      history.current.forEach((v, i) => {
        const amp = Math.max(0.08, Math.min(1, v))
        const bh = Math.max(3, amp * h)
        const x = i * (bw + gap)
        const y = (h - bh) / 2
        g.globalAlpha = 0.35 + 0.65 * (i / bars)
        g.beginPath()
        g.roundRect(x, y, bw, bh, bw / 2)
        g.fill()
      })
      g.globalAlpha = 1
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [active, bars, color, idleMotion])

  return <canvas ref={canvas} className={className} aria-hidden />
}
