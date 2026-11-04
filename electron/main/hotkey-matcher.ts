/**
 * Pure push-to-talk state machine over native key events (no Electron imports → unit-testable).
 *
 *  - Filters OS auto-repeat (repeated keydown while held).
 *  - Fires `press` once per physical press and `release` when THAT key goes up, even if the
 *    user lets go of the modifiers first (Ctrl+Shift+Space released in any order).
 *  - Can be suspended while the settings UI captures a new binding.
 */
import { EventEmitter } from 'node:events'
import type { HotkeyAction, HotkeyBinding } from '../../shared/hotkeys'
import { isModifierKeycode, keyDefFromKeycode } from '../../shared/hotkeys'
import type { NativeKeyEvent } from '../native/input-bridge'

export class HotkeyMatcher extends EventEmitter {
  private bindings = new Map<HotkeyAction, HotkeyBinding>()
  private pressed = new Set<number>()
  /** keycode → action currently held */
  private held = new Map<number, HotkeyAction>()
  private suspended = false
  private modifiers = { ctrl: false, shift: false, alt: false, meta: false }

  setBindings(bindings: Partial<Record<HotkeyAction, HotkeyBinding | null>>) {
    this.bindings.clear()
    for (const [action, b] of Object.entries(bindings) as [HotkeyAction, HotkeyBinding | null][]) {
      if (b) this.bindings.set(action, b)
    }
    // Releasing stale holds avoids a recording that can never stop after a rebind.
    for (const [code, action] of this.held) {
      this.held.delete(code)
      this.emit('release', action)
    }
  }

  setSuspended(s: boolean) {
    this.suspended = s
    if (s) {
      for (const [, action] of this.held) this.emit('release', action)
      this.held.clear()
    }
  }

  isSuspended() {
    return this.suspended
  }

  /** True while any modifier key is physically down (used before synthesising Ctrl+V). */
  modifiersDown(): boolean {
    return this.modifiers.ctrl || this.modifiers.shift || this.modifiers.alt || this.modifiers.meta
  }

  isHeld(action: HotkeyAction): boolean {
    for (const a of this.held.values()) if (a === action) return true
    return false
  }

  private trackModifiers(e: NativeKeyEvent) {
    const down = e.type === 'down'
    switch (e.keycode) {
      case 29:
      case 3613:
        this.modifiers.ctrl = down
        break
      case 42:
      case 54:
        this.modifiers.shift = down
        break
      case 56:
      case 3640:
        this.modifiers.alt = down
        break
      case 3675:
      case 3676:
        this.modifiers.meta = down
        break
    }
  }

  private matches(b: HotkeyBinding, e: NativeKeyEvent): boolean {
    if (b.keycode !== e.keycode) return false
    const def = keyDefFromKeycode(b.keycode)
    if (def?.standaloneModifier) {
      // Lone right-hand modifier: other modifiers must not be held (Right Alt alone, not Ctrl+Right Alt / AltGr combos).
      const others = { ...this.modifiers }
      if (b.keycode === 3640) others.alt = false
      if (b.keycode === 3613) others.ctrl = false
      if (b.keycode === 3676) others.meta = false
      if (b.keycode === 54) others.shift = false
      return !others.ctrl && !others.shift && !others.alt && !others.meta
    }
    return b.ctrl === e.ctrl && b.shift === e.shift && b.alt === e.alt && b.meta === e.meta
  }

  handle(e: NativeKeyEvent) {
    if (e.type === 'down') {
      const repeat = this.pressed.has(e.keycode)
      this.pressed.add(e.keycode)
      // For standalone-modifier bindings we must check modifiers BEFORE updating our own state.
      if (!repeat && !this.suspended && !isModifierKeycode(e.keycode)) {
        // Holding Right Option/Alt and then typing a letter is a character chord (e.g. ⌥E → é),
        // not push-to-talk: abort any dictation started by a lone-modifier binding.
        for (const [code, action] of this.held) {
          if (keyDefFromKeycode(code)?.standaloneModifier) {
            this.held.delete(code)
            this.emit('chord', action)
          }
        }
      }
      if (!repeat && !this.suspended) {
        for (const [action, b] of this.bindings) {
          if (this.matches(b, e)) {
            this.held.set(e.keycode, action)
            this.emit('press', action)
            break
          }
        }
      }
      this.trackModifiers(e)
      return
    }
    this.pressed.delete(e.keycode)
    this.trackModifiers(e)
    const action = this.held.get(e.keycode)
    if (action) {
      this.held.delete(e.keycode)
      this.emit('release', action)
    }
  }

  /** Clears key state (e.g. after the system resumes from sleep where keyups may be lost). */
  reset() {
    for (const [, action] of this.held) this.emit('release', action)
    this.held.clear()
    this.pressed.clear()
    this.modifiers = { ctrl: false, shift: false, alt: false, meta: false }
  }
}
