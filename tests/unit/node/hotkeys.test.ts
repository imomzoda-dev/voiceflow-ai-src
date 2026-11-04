import { describe, it, expect } from 'vitest'
import { HotkeyMatcher } from '../../../electron/main/hotkey-matcher'
import { bindingFromDomEvent, bindingToAccelerator, formatBinding, isUnsafeBareBinding, knownSystemConflict, DEFAULT_DICTATE_BINDING } from '../../../shared/hotkeys'
import type { NativeKeyEvent } from '../../../electron/native/input-bridge'

const ev = (type: 'down' | 'up', keycode: number, mods: Partial<NativeKeyEvent> = {}): NativeKeyEvent => ({ type, keycode, ctrl: false, shift: false, alt: false, meta: false, time: Date.now(), ...mods })

function record(m: HotkeyMatcher) {
  const log: string[] = []
  m.on('press', (a) => log.push(`press:${a}`))
  m.on('release', (a) => log.push(`release:${a}`))
  return log
}

describe('HotkeyMatcher (push-to-talk)', () => {
  it('fires press once and release once for F12, ignoring OS auto-repeat', () => {
    const m = new HotkeyMatcher()
    m.setBindings({ dictate: DEFAULT_DICTATE_BINDING })
    const log = record(m)
    m.handle(ev('down', 88))
    m.handle(ev('down', 88)) // auto-repeat
    m.handle(ev('down', 88))
    m.handle(ev('up', 88))
    expect(log).toEqual(['press:dictate', 'release:dictate'])
  })

  it('matches modifier combos exactly and releases even if modifiers go up first', () => {
    const m = new HotkeyMatcher()
    m.setBindings({ dictate: { keycode: 57, ctrl: true, shift: true, alt: false, meta: false } }) // Ctrl+Shift+Space
    const log = record(m)
    m.handle(ev('down', 57)) // bare Space: no match
    m.handle(ev('up', 57))
    m.handle(ev('down', 29, { ctrl: true }))
    m.handle(ev('down', 42, { ctrl: true, shift: true }))
    m.handle(ev('down', 57, { ctrl: true, shift: true }))
    m.handle(ev('up', 29, { shift: true }))
    m.handle(ev('up', 42))
    expect(m.modifiersDown()).toBe(false)
    m.handle(ev('up', 57))
    expect(log).toEqual(['press:dictate', 'release:dictate'])
  })

  it('supports Right Alt alone but not with other modifiers held', () => {
    const m = new HotkeyMatcher()
    m.setBindings({ dictate: { keycode: 3640, ctrl: false, shift: false, alt: false, meta: false } })
    const log = record(m)
    m.handle(ev('down', 3640, { alt: true }))
    m.handle(ev('up', 3640))
    m.handle(ev('down', 29, { ctrl: true }))
    m.handle(ev('down', 3640, { ctrl: true, alt: true })) // AltGr-like combo
    m.handle(ev('up', 3640))
    m.handle(ev('up', 29))
    expect(log).toEqual(['press:dictate', 'release:dictate'])
  })

  it('suspending releases held actions and blocks new presses', () => {
    const m = new HotkeyMatcher()
    m.setBindings({ dictate: DEFAULT_DICTATE_BINDING })
    const log = record(m)
    m.handle(ev('down', 88))
    m.setSuspended(true)
    m.handle(ev('up', 88))
    m.handle(ev('down', 88))
    expect(log).toEqual(['press:dictate', 'release:dictate'])
  })

  it('reset() releases stuck keys (e.g. after sleep)', () => {
    const m = new HotkeyMatcher()
    m.setBindings({ dictate: DEFAULT_DICTATE_BINDING })
    const log = record(m)
    m.handle(ev('down', 88))
    m.reset()
    expect(log).toEqual(['press:dictate', 'release:dictate'])
  })
})

describe('hotkey helpers', () => {
  it('maps DOM events to bindings and accelerators', () => {
    const r = bindingFromDomEvent({ code: 'F12', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false })
    expect(r).toEqual({ ok: true, binding: DEFAULT_DICTATE_BINDING })
    expect(bindingToAccelerator(DEFAULT_DICTATE_BINDING, 'win32')).toBe('F12')
    expect(bindingToAccelerator({ keycode: 57, ctrl: true, shift: true, alt: false, meta: false }, 'win32')).toBe('Control+Shift+Space')
    expect(bindingToAccelerator({ keycode: 3640, ctrl: false, shift: false, alt: false, meta: false }, 'win32')).toBeNull()
    expect(bindingFromDomEvent({ code: 'ControlLeft', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false })).toEqual({ ok: false, reason: 'pending' })
    expect(formatBinding({ keycode: 31, ctrl: false, shift: true, alt: false, meta: true }, 'darwin')).toBe('⇧⌘S')
  })

  it('flags unsafe and system-reserved bindings', () => {
    expect(isUnsafeBareBinding({ keycode: 30, ctrl: false, shift: false, alt: false, meta: false })).toBe(true) // bare A
    expect(isUnsafeBareBinding(DEFAULT_DICTATE_BINDING)).toBe(false)
    expect(knownSystemConflict({ keycode: 62, ctrl: false, shift: false, alt: true, meta: false }, 'win32')).toBe('Close window')
    expect(knownSystemConflict({ keycode: 57, ctrl: false, shift: false, alt: false, meta: true }, 'darwin')).toBe('Spotlight')
  })
})
