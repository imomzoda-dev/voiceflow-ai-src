/**
 * Glue between the native hook, the matcher, Electron's globalShortcut (used only to swallow
 * the key so it doesn't also reach the focused app, and to detect conflicts) and app actions.
 */
import { globalShortcut } from 'electron'
import { EventEmitter } from 'node:events'
import type { NativeInputBridge } from '../native/input-bridge'
import { HotkeyMatcher } from './hotkey-matcher'
import { bindingToAccelerator, knownSystemConflict, type HotkeyAction, type HotkeyBinding } from '../../shared/hotkeys'
import type { AppSettings } from '../../shared/settings'
import type { HotkeyStatus } from '../../shared/types'
import { createLogger } from './logger'

const log = createLogger('hotkeys')
const noop = () => {}

export class HotkeyManager extends EventEmitter {
  readonly matcher = new HotkeyMatcher()
  private registered = new Map<HotkeyAction, string>()
  private conflicts = new Map<HotkeyAction, string | null>()
  private bindings: Record<HotkeyAction, HotkeyBinding | null> = { dictate: null, cancel: null, openWindow: null, pasteLast: null, cycleMode: null }
  private suppress = true
  private cancelArmed = false
  private pickerActive = false
  private static readonly PICKER_KEYS = ['Left', 'Right', 'Enter', '1', '2', '3']

  /** While the picker is open, its keys are kept from reaching the focused app. */
  setPicker(active: boolean) {
    if (this.pickerActive === active) return
    this.pickerActive = active
    for (const acc of HotkeyManager.PICKER_KEYS) {
      try {
        if (active) {
          if (!globalShortcut.isRegistered(acc)) globalShortcut.register(acc, noop)
        } else globalShortcut.unregister(acc)
      } catch {
        /* ignore */
      }
    }
  }

  constructor(
    private readonly bridge: NativeInputBridge,
    private readonly platform: NodeJS.Platform = process.platform
  ) {
    super()
    bridge.on('key', (e) => {
      // Language picker: <- -> move, Enter confirms, 1-3 choose directly (only while the picker is open).
      if (this.pickerActive && e.type === 'down' && !e.ctrl && !e.alt && !e.meta) {
        if (e.keycode === 57419) return void this.emit('pick', -1)
        if (e.keycode === 57421) return void this.emit('pick', 1)
        if (e.keycode === 28 || e.keycode === 3612) return void this.emit('pickConfirm')
        if (e.keycode >= 2 && e.keycode <= 4) return void this.emit('pickIndex', e.keycode - 2)
      }
      this.matcher.handle(e)
    })
    this.matcher.on('press', (a: HotkeyAction) => {
      if (a === 'cancel' && !this.cancelArmed) return
      this.emit('press', a)
    })
    this.matcher.on('release', (a: HotkeyAction) => this.emit('release', a))
    this.matcher.on('chord', (a: HotkeyAction) => this.emit('chord', a))
  }

  start() {
    this.bridge.start()
  }

  stop() {
    this.unregisterAll()
    this.bridge.stop()
  }

  apply(settings: AppSettings) {
    const hk = settings.voice.hotkeys
    this.bindings = { ...hk }
    this.suppress = settings.voice.suppressHotkey
    // In manual mode the dictation hotkey is disabled entirely.
    const active: Partial<Record<HotkeyAction, HotkeyBinding | null>> = { ...hk }
    if (settings.voice.activationMode === 'manual') active.dictate = null
    this.matcher.setBindings(active)
    this.registerSuppression(active)
  }

  /** Esc-style cancel keys are only intercepted while a dictation is running. */
  armCancel(armed: boolean) {
    if (this.cancelArmed === armed) return
    this.cancelArmed = armed
    const b = this.bindings.cancel
    if (!b || !this.suppress) return
    const acc = bindingToAccelerator(b, this.platform)
    if (!acc) return
    try {
      if (armed) {
        if (!globalShortcut.isRegistered(acc)) globalShortcut.register(acc, noop)
      } else if (this.registered.get('cancel') !== acc) {
        globalShortcut.unregister(acc)
      }
    } catch {
      /* ignore */
    }
  }

  private unregisterAll() {
    for (const acc of this.registered.values()) {
      try {
        globalShortcut.unregister(acc)
      } catch {
        /* ignore */
      }
    }
    this.registered.clear()
  }

  private registerSuppression(active: Partial<Record<HotkeyAction, HotkeyBinding | null>>) {
    this.unregisterAll()
    this.conflicts.clear()
    for (const [action, b] of Object.entries(active) as [HotkeyAction, HotkeyBinding | null][]) {
      if (!b) continue
      const sys = knownSystemConflict(b, this.platform)
      if (sys) this.conflicts.set(action, `system:${sys}`)
      if (action === 'cancel' || !this.suppress) continue
      const acc = bindingToAccelerator(b, this.platform)
      if (!acc) continue // lone modifiers can't be registered; the native hook still works
      try {
        const ok = globalShortcut.register(acc, noop)
        if (ok) this.registered.set(action, acc)
        else {
          this.conflicts.set(action, 'in-use')
          log.warn(`Shortcut ${acc} for ${action} is already registered by another application`)
        }
      } catch (e) {
        this.conflicts.set(action, 'invalid')
        log.warn(`Could not register ${acc}`, e)
      }
    }
  }

  async suspend(s: boolean, settings: AppSettings) {
    this.matcher.setSuspended(s)
    if (s) this.unregisterAll()
    else this.apply(settings)
  }

  /** Checks whether a binding could be registered right now (for the settings UI). */
  checkBinding(b: HotkeyBinding): { ok: boolean; conflict: string | null } {
    const sys = knownSystemConflict(b, this.platform)
    if (sys) return { ok: false, conflict: `system:${sys}` }
    const acc = bindingToAccelerator(b, this.platform)
    if (!acc) return { ok: true, conflict: null }
    if ([...this.registered.values()].includes(acc)) return { ok: true, conflict: null }
    try {
      const ok = globalShortcut.register(acc, noop)
      if (ok) globalShortcut.unregister(acc)
      return { ok, conflict: ok ? null : 'in-use' }
    } catch {
      return { ok: false, conflict: 'invalid' }
    }
  }

  status(): HotkeyStatus {
    return {
      nativeHookRunning: this.bridge.isRunning(),
      nativeError: this.bridge.lastError(),
      registrations: (Object.keys(this.bindings) as HotkeyAction[]).map((action) => ({
        action,
        binding: this.bindings[action],
        suppressed: this.registered.has(action),
        conflict: this.conflicts.get(action) ?? null
      }))
    }
  }
}
