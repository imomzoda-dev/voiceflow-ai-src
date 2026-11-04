import { create } from 'zustand'
import type { AppSettings, SettingsSection } from '@shared/settings'
import type { DictationResult, DictationState } from '@shared/types'
import { api, errorMessage } from '@/lib/utils'

/* --------------------------------- settings --------------------------------- */

interface SettingsStore {
  settings: AppSettings | null
  load(): Promise<void>
  update<K extends SettingsSection>(section: K, patch: Partial<AppSettings[K]>): Promise<void>
  set(s: AppSettings): void
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: null,
  async load() {
    set({ settings: await api().settings.get() })
  },
  set(s) {
    set({ settings: s })
  },
  async update(section, patch) {
    const prev = get().settings
    if (prev) set({ settings: { ...prev, [section]: { ...prev[section], ...patch } } })
    try {
      set({ settings: await api().settings.update(section, patch) })
    } catch (e) {
      if (prev) set({ settings: prev })
      toast.error(errorMessage(e))
    }
  }
}))

/* --------------------------------- routing --------------------------------- */

export type Page = 'dashboard' | 'documents' | 'editor' | 'voice' | 'history' | 'assistant' | 'dictionary' | 'templates' | 'settings'

export interface Route {
  page: Page
  docId?: string
  section?: string
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('vf.sidebar.collapsed') === '1'
  } catch {
    return false
  }
}

interface UiStore {
  route: Route
  sidebarCollapsed: boolean
  navigate(r: Route | Page): void
  toggleSidebar(): void
}

export const useUi = create<UiStore>((set) => ({
  route: { page: 'dashboard' },
  sidebarCollapsed: readCollapsed(),
  navigate(r) {
    set({ route: typeof r === 'string' ? { page: r } : r })
  },
  toggleSidebar() {
    set((s) => {
      const v = !s.sidebarCollapsed
      try {
        localStorage.setItem('vf.sidebar.collapsed', v ? '1' : '0')
      } catch {
        /* ignore */
      }
      return { sidebarCollapsed: v }
    })
  }
}))

/* -------------------------------- dictation -------------------------------- */

interface DictationStore {
  state: DictationState | null
  last: DictationResult | null
  level: number
  setState(s: DictationState): void
  setLast(r: DictationResult): void
  setLevel(l: number): void
}

export const useDictation = create<DictationStore>((set) => ({
  state: null,
  last: null,
  level: 0,
  setState: (s) => set((st) => ({ state: s, level: s.phase === 'recording' ? st.level : 0 })),
  setLast: (r) => set({ last: r }),
  setLevel: (l) => set({ level: l })
}))

/* ---------------------------------- toasts ---------------------------------- */

export interface ToastItem {
  id: number
  kind: 'info' | 'success' | 'error'
  message: string
  action?: { label: string; run: () => void }
}

interface ToastStore {
  items: ToastItem[]
  push(t: Omit<ToastItem, 'id'>): void
  dismiss(id: number): void
}

let seq = 0
export const useToasts = create<ToastStore>((set, get) => ({
  items: [],
  push(t) {
    const id = ++seq
    set({ items: [...get().items.slice(-3), { ...t, id }] })
    setTimeout(() => get().dismiss(id), t.kind === 'error' ? 6000 : 3200)
  },
  dismiss(id) {
    set({ items: get().items.filter((i) => i.id !== id) })
  }
}))

export const toast = {
  info: (message: string, action?: ToastItem['action']) => useToasts.getState().push({ kind: 'info', message, action }),
  success: (message: string, action?: ToastItem['action']) => useToasts.getState().push({ kind: 'success', message, action }),
  error: (message: string, action?: ToastItem['action']) => useToasts.getState().push({ kind: 'error', message, action })
}
