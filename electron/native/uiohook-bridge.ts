/**
 * libuiohook implementation (uiohook-napi, N-API, prebuilt for win32/darwin x64+arm64).
 *  - Windows: WH_KEYBOARD_LL low-level hook.
 *  - macOS: CGEventTap — requires Accessibility (and on recent macOS, Input Monitoring) permission.
 *
 * Privacy: events are forwarded in-process to the hotkey matcher only. Nothing is recorded,
 * buffered or logged. Mouse events are not subscribed to.
 */
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import type { NativeInputBridge, NativeKeyEvent } from './input-bridge'
import { createLogger } from '../main/logger'

const log = createLogger('native')

interface UiohookModule {
  uIOhook: EventEmitter & {
    start(): void
    stop(): void
    keyTap(key: number, modifiers?: number[]): void
  }
}

export class UiohookBridge extends EventEmitter implements NativeInputBridge {
  readonly name = 'libuiohook'
  private mod: UiohookModule | null = null
  private running = false
  private error: string | null = null

  private readonly onDown = (e: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; time: number }) =>
    this.forward('down', e)
  private readonly onUp = (e: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; time: number }) =>
    this.forward('up', e)

  private forward(type: 'down' | 'up', e: { keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; time: number }) {
    const ev: NativeKeyEvent = { type, keycode: e.keycode, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, time: e.time }
    this.emit('key', ev)
  }

  private load(): UiohookModule {
    if (this.mod) return this.mod
    const req = createRequire(__filename)
    this.mod = req('uiohook-napi') as UiohookModule
    return this.mod
  }

  start() {
    if (this.running) return
    try {
      const { uIOhook } = this.load()
      uIOhook.on('keydown', this.onDown)
      uIOhook.on('keyup', this.onUp)
      uIOhook.start()
      this.running = true
      this.error = null
      log.info('Native keyboard hook started')
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      log.error('Failed to start native keyboard hook', e)
      this.emit('error', e instanceof Error ? e : new Error(String(e)))
    }
  }

  stop() {
    if (!this.running || !this.mod) return
    try {
      this.mod.uIOhook.off('keydown', this.onDown)
      this.mod.uIOhook.off('keyup', this.onUp)
      this.mod.uIOhook.stop()
    } catch (e) {
      log.warn('Error while stopping hook', e)
    }
    this.running = false
  }

  isRunning() {
    return this.running
  }

  tap(keycode: number, modifiers: number[]) {
    this.load().uIOhook.keyTap(keycode, modifiers)
  }

  lastError() {
    return this.error
  }
}
