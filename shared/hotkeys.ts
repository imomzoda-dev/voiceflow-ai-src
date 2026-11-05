/**
 * Hotkey model shared by the renderer (capture UI) and the main process
 * (native hook matching + globalShortcut suppression).
 *
 * Key codes are libuiohook virtual codes (see uiohook-napi `UiohookKey`).
 */

export interface HotkeyBinding {
  /** libuiohook key code of the non-modifier key (or of a modifier used alone, e.g. Right Alt). */
  keycode: number
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
}

export type HotkeyAction = 'dictate' | 'cancel' | 'openWindow' | 'pasteLast' | 'cycleMode'

export interface KeyDef {
  /** DOM `KeyboardEvent.code` */
  code: string
  /** libuiohook keycode */
  keycode: number
  /** Human label */
  label: string
  /** Electron accelerator key name, or null when the key cannot be an accelerator (lone modifiers). */
  accelerator: string | null
  /** True when this key is itself a modifier and may be bound alone (Right Alt etc.). */
  standaloneModifier?: boolean
}

const fn: KeyDef[] = [
  [59, 1], [60, 2], [61, 3], [62, 4], [63, 5], [64, 6], [65, 7], [66, 8], [67, 9], [68, 10], [87, 11], [88, 12],
  [91, 13], [92, 14], [93, 15], [99, 16], [100, 17], [101, 18], [102, 19], [103, 20], [104, 21], [105, 22], [106, 23], [107, 24]
].map(([keycode, n]) => ({ code: `F${n}`, keycode, label: `F${n}`, accelerator: `F${n}` }))

const letters: KeyDef[] = (
  [
    ['A', 30], ['B', 48], ['C', 46], ['D', 32], ['E', 18], ['F', 33], ['G', 34], ['H', 35], ['I', 23], ['J', 36], ['K', 37], ['L', 38], ['M', 50],
    ['N', 49], ['O', 24], ['P', 25], ['Q', 16], ['R', 19], ['S', 31], ['T', 20], ['U', 22], ['V', 47], ['W', 17], ['X', 45], ['Y', 21], ['Z', 44]
  ] as const
).map(([l, keycode]) => ({ code: `Key${l}`, keycode, label: l, accelerator: l }))

const digits: KeyDef[] = (
  [['0', 11], ['1', 2], ['2', 3], ['3', 4], ['4', 5], ['5', 6], ['6', 7], ['7', 8], ['8', 9], ['9', 10]] as const
).map(([d, keycode]) => ({ code: `Digit${d}`, keycode, label: d, accelerator: d }))

const misc: KeyDef[] = [
  { code: 'Home', keycode: 3655, label: 'Home', accelerator: 'Home' },
  { code: 'End', keycode: 3663, label: 'End', accelerator: 'End' },
  { code: 'Insert', keycode: 3666, label: 'Insert', accelerator: 'Insert' },
  { code: 'Delete', keycode: 3667, label: 'Delete', accelerator: 'Delete' },
  { code: 'PageUp', keycode: 3657, label: 'Page Up', accelerator: 'PageUp' },
  { code: 'PageDown', keycode: 3665, label: 'Page Down', accelerator: 'PageDown' },
  { code: 'ArrowUp', keycode: 57416, label: '↑', accelerator: 'Up' },
  { code: 'ArrowDown', keycode: 57424, label: '↓', accelerator: 'Down' },
  { code: 'ArrowLeft', keycode: 57419, label: '←', accelerator: 'Left' },
  { code: 'ArrowRight', keycode: 57421, label: '→', accelerator: 'Right' },
  { code: 'Space', keycode: 57, label: 'Space', accelerator: 'Space' },
  { code: 'Escape', keycode: 1, label: 'Esc', accelerator: 'Escape' },
  { code: 'Enter', keycode: 28, label: 'Enter', accelerator: 'Enter' },
  { code: 'Tab', keycode: 15, label: 'Tab', accelerator: 'Tab' },
  { code: 'Backquote', keycode: 41, label: '`', accelerator: '`' },
  { code: 'Minus', keycode: 12, label: '-', accelerator: '-' },
  { code: 'Equal', keycode: 13, label: '=', accelerator: '=' },
  { code: 'BracketLeft', keycode: 26, label: '[', accelerator: '[' },
  { code: 'BracketRight', keycode: 27, label: ']', accelerator: ']' },
  { code: 'Backslash', keycode: 43, label: '\\', accelerator: '\\' },
  { code: 'Semicolon', keycode: 39, label: ';', accelerator: ';' },
  { code: 'Quote', keycode: 40, label: "'", accelerator: "'" },
  { code: 'Comma', keycode: 51, label: ',', accelerator: ',' },
  { code: 'Period', keycode: 52, label: '.', accelerator: '.' },
  { code: 'Slash', keycode: 53, label: '/', accelerator: '/' },
  { code: 'ScrollLock', keycode: 70, label: 'Scroll Lock', accelerator: 'Scrolllock' },
  { code: 'Pause', keycode: 3653, label: 'Pause', accelerator: null },
  { code: 'NumpadAdd', keycode: 78, label: 'Num +', accelerator: 'numadd' },
  { code: 'NumpadSubtract', keycode: 74, label: 'Num −', accelerator: 'numsub' },
  { code: 'NumpadMultiply', keycode: 55, label: 'Num *', accelerator: 'nummult' },
  { code: 'NumpadDivide', keycode: 3637, label: 'Num /', accelerator: 'numdiv' },
  { code: 'Numpad0', keycode: 82, label: 'Num 0', accelerator: 'num0' },
  { code: 'AltRight', keycode: 3640, label: 'Right Alt', accelerator: null, standaloneModifier: true },
  { code: 'ControlRight', keycode: 3613, label: 'Right Ctrl', accelerator: null, standaloneModifier: true },
  { code: 'MetaRight', keycode: 3676, label: 'Right ⌘/Win', accelerator: null, standaloneModifier: true },
  { code: 'ShiftRight', keycode: 54, label: 'Right Shift', accelerator: null, standaloneModifier: true }
]

export const KEY_DEFS: readonly KeyDef[] = [...fn, ...letters, ...digits, ...misc]

const byCode = new Map(KEY_DEFS.map((k) => [k.code, k]))
const byKeycode = new Map(KEY_DEFS.map((k) => [k.keycode, k]))

/** libuiohook codes of all modifier keys (both sides). */
export const MODIFIER_KEYCODES = {
  ctrl: [29, 3613],
  shift: [42, 54],
  alt: [56, 3640],
  meta: [3675, 3676]
} as const

const ALL_MODIFIER_CODES = new Set<number>(Object.values(MODIFIER_KEYCODES).flat())

export function isModifierKeycode(keycode: number): boolean {
  return ALL_MODIFIER_CODES.has(keycode)
}

export function keyDefFromCode(code: string): KeyDef | undefined {
  return byCode.get(code)
}

export function keyDefFromKeycode(keycode: number): KeyDef | undefined {
  return byKeycode.get(keycode)
}

const DOM_MODIFIER_CODES = new Set(['ControlLeft', 'ShiftLeft', 'AltLeft', 'MetaLeft', 'OSLeft'])

export type CaptureResult =
  | { ok: true; binding: HotkeyBinding }
  | { ok: false; reason: 'modifier-only' | 'unsupported-key' | 'pending' }

/**
 * Turns a DOM keydown into a binding. Left-side modifiers alone are "pending"
 * (the user is still building a combination); right-side modifiers may be bound alone.
 */
export function bindingFromDomEvent(e: {
  code: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}): CaptureResult {
  if (DOM_MODIFIER_CODES.has(e.code)) return { ok: false, reason: 'pending' }
  const def = byCode.get(e.code)
  if (!def) return { ok: false, reason: 'unsupported-key' }
  if (def.standaloneModifier) {
    // A lone right-hand modifier (e.g. Right Alt). Its own modifier flag is ignored.
    return { ok: true, binding: { keycode: def.keycode, ctrl: false, shift: false, alt: false, meta: false } }
  }
  return {
    ok: true,
    binding: { keycode: def.keycode, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey }
  }
}

/** Mac keyboards name these keys with symbols. */
const MAC_LABELS: Record<string, string> = { AltRight: 'Right ⌥', ControlRight: 'Right ⌃', MetaRight: 'Right ⌘', ShiftRight: 'Right ⇧' }

export function formatBinding(b: HotkeyBinding | null | undefined, platform: string): string {
  if (!b) return '—'
  const mac = platform === 'darwin'
  const parts: string[] = []
  if (b.ctrl) parts.push(mac ? '⌃' : 'Ctrl')
  if (b.alt) parts.push(mac ? '⌥' : 'Alt')
  if (b.shift) parts.push(mac ? '⇧' : 'Shift')
  if (b.meta) parts.push(mac ? '⌘' : 'Win')
  const def = keyDefFromKeycode(b.keycode)
  parts.push((mac && def ? MAC_LABELS[def.code] : undefined) ?? def?.label ?? `Key ${b.keycode}`)
  return parts.join(mac ? '' : ' + ')
}

/** Electron accelerator for globalShortcut suppression/conflict checks, or null if not expressible. */
export function bindingToAccelerator(b: HotkeyBinding, platform: string): string | null {
  const def = keyDefFromKeycode(b.keycode)
  if (!def?.accelerator) return null
  const parts: string[] = []
  if (b.ctrl) parts.push('Control')
  if (b.alt) parts.push('Alt')
  if (b.shift) parts.push('Shift')
  if (b.meta) parts.push(platform === 'darwin' ? 'Command' : 'Super')
  parts.push(def.accelerator)
  return parts.join('+')
}

export function bindingsEqual(a: HotkeyBinding | null | undefined, b: HotkeyBinding | null | undefined): boolean {
  if (!a || !b) return false
  return a.keycode === b.keycode && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta
}

/** Single-key bindings that would break normal typing if bound without modifiers. */
export function isUnsafeBareBinding(b: HotkeyBinding): boolean {
  if (b.ctrl || b.alt || b.meta || b.shift) return false
  const def = keyDefFromKeycode(b.keycode)
  if (!def) return true
  if (def.standaloneModifier) return false
  return /^(Key|Digit)/.test(def.code) || ['Space', 'Enter', 'Tab', 'Backquote', 'Minus', 'Equal', 'Comma', 'Period', 'Slash', 'Semicolon', 'Quote', 'BracketLeft', 'BracketRight', 'Backslash'].includes(def.code)
}

/** Well-known system shortcuts we refuse or warn about. */
export function knownSystemConflict(b: HotkeyBinding, platform: string): string | null {
  const acc = bindingToAccelerator(b, platform)
  if (!acc) return null
  const win: Record<string, string> = {
    'Alt+F4': 'Close window',
    'Alt+Tab': 'Switch windows',
    'Control+Alt+Delete': 'Security screen',
    'Super+L': 'Lock screen',
    'Super+D': 'Show desktop',
    'Control+Escape': 'Start menu',
    'Control+C': 'Copy',
    'Control+V': 'Paste',
    'Control+X': 'Cut',
    'Control+Z': 'Undo'
  }
  const mac: Record<string, string> = {
    'Command+Q': 'Quit app',
    'Command+Tab': 'Switch apps',
    'Command+Space': 'Spotlight',
    'Command+C': 'Copy',
    'Command+V': 'Paste',
    'Command+X': 'Cut',
    'Command+Z': 'Undo',
    'Command+W': 'Close window',
    'Control+Command+Q': 'Lock screen'
  }
  return (platform === 'darwin' ? mac : win)[acc] ?? null
}

export const DEFAULT_DICTATE_BINDING: HotkeyBinding = { keycode: 88, ctrl: false, shift: false, alt: false, meta: false } // F12
export const DEFAULT_CANCEL_BINDING: HotkeyBinding = { keycode: 1, ctrl: false, shift: false, alt: false, meta: false } // Esc (only while recording)
