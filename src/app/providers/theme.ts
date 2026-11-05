import type { AppSettings } from '@shared/settings'

let mql: MediaQueryList | null = null
let current: AppSettings['appearance'] | null = null

function resolveDark(theme: AppSettings['appearance']['theme']): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Applies theme, accent, density and motion preference to <html>. */
export function applyTheme(a: AppSettings['appearance']) {
  current = a
  const root = document.documentElement
  const isMac = navigator.userAgent.includes('Mac')
  root.classList.toggle('platform-mac', isMac)
  // The main window has a native material behind it on macOS (window-manager.ts macVibrancy); the overlay does not.
  const material = a.windowMaterial ?? 'liquid'
  const main = isMac && !document.body.classList.contains('overlay-body')
  root.classList.toggle('vibrancy', main && material !== 'solid')
  root.classList.toggle('mat-liquid', main && material === 'liquid')
  root.classList.toggle('dark', resolveDark(a.theme))
  root.dataset.accent = a.accent
  root.dataset.density = a.compact ? 'compact' : 'normal'
  const reduce = a.motion === 'reduced' || (a.motion === 'system' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  root.dataset.motion = reduce ? 'reduced' : 'full'
  if (!mql) {
    mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', () => current && applyTheme(current))
  }
}

export function prefersReducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduced'
}
