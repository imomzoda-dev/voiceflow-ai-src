import { describe, expect, it, vi, beforeEach } from 'vitest'

const shortcuts = new Map<string, () => void>()
vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn((acc: string, cb: () => void) => (shortcuts.set(acc, cb), true)),
    unregister: vi.fn((acc: string) => shortcuts.delete(acc)),
    isRegistered: vi.fn((acc: string) => shortcuts.has(acc)),
    unregisterAll: vi.fn(() => shortcuts.clear())
  }
}))

const { HotkeyManager, pickerKey } = await import('../../../electron/main/hotkey-manager')
const { NullInputBridge } = await import('../../../electron/native/input-bridge')

const LEFT = 57419
const RIGHT = 57421
const key = (keycode: number, type: 'down' | 'up', mods: Partial<{ alt: boolean; ctrl: boolean; meta: boolean }> = {}) => ({
  type,
  keycode,
  ctrl: false,
  shift: false,
  alt: false,
  meta: false,
  time: Date.now(),
  ...mods
})

describe('language picker keys', () => {
  beforeEach(() => shortcuts.clear())

  it('maps arrows, Enter and 1-3', () => {
    expect(pickerKey(LEFT)).toEqual({ kind: 'move', delta: -1 })
    expect(pickerKey(RIGHT)).toEqual({ kind: 'move', delta: 1 })
    expect(pickerKey(28)).toEqual({ kind: 'confirm' })
    expect(pickerKey(4)).toEqual({ kind: 'index', index: 2 })
    expect(pickerKey(30)).toBeNull()
  })

  it('moves with the arrows while Right Option (the macOS dictation key) is still held', () => {
    const bridge = new NullInputBridge()
    const hk = new HotkeyManager(bridge, 'darwin')
    const picks: number[] = []
    hk.on('pick', (d: number) => picks.push(d))
    hk.setPicker(true)
    bridge.emit('key', key(RIGHT, 'down', { alt: true }))
    bridge.emit('key', key(RIGHT, 'up', { alt: true }))
    bridge.emit('key', key(LEFT, 'down'))
    expect(picks).toEqual([1, -1])
  })

  it('swallows Option+arrow in other apps and accepts it through globalShortcut too, counting one press once', () => {
    const bridge = new NullInputBridge()
    const hk = new HotkeyManager(bridge, 'darwin')
    const picks: number[] = []
    hk.on('pick', (d: number) => picks.push(d))
    hk.setPicker(true)
    expect([...shortcuts.keys()]).toEqual(expect.arrayContaining(['Left', 'Right', 'Alt+Left', 'Alt+Right', 'Enter']))
    // macOS: the key reaches only the global shortcut.
    shortcuts.get('Alt+Right')!()
    expect(picks).toEqual([1])
    // Windows: the same press arrives through both paths: counted once.
    bridge.emit('key', key(LEFT, 'down'))
    shortcuts.get('Left')!()
    expect(picks).toEqual([1, -1])
    hk.setPicker(false)
    expect(shortcuts.size).toBe(0)
    bridge.emit('key', key(LEFT, 'down'))
    expect(picks).toEqual([1, -1])
  })
})
