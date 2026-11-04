import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const api = () => window.voiceflow

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

export function relativeTime(ts: number, lang: string): string {
  const rtf = new Intl.RelativeTimeFormat(lang === 'tg' ? 'tg' : lang, { numeric: 'auto' })
  const diff = (ts - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return new Date(ts).toLocaleDateString(lang)
}

export function formatDateTime(ts: number, lang: string): string {
  return new Date(ts).toLocaleString(lang === 'tg' ? 'tg-TJ' : lang, { dateStyle: 'medium', timeStyle: 'short' })
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  return String(e)
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null
  const d = (...a: A) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      t = null
      fn(...a)
    }, ms)
  }
  d.cancel = () => {
    if (t) clearTimeout(t)
    t = null
  }
  d.pending = () => t !== null
  return d
}
