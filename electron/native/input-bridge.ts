/**
 * Native input abstraction. The hotkey manager and typing service depend only on this
 * interface, so the libuiohook implementation can be swapped for a Rust (napi-rs) helper
 * later without touching higher-level logic. See native/README.md.
 */
import { EventEmitter } from 'node:events'

export interface NativeKeyEvent {
  type: 'down' | 'up'
  keycode: number
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  time: number
}

export interface NativeInputBridge extends EventEmitter {
  readonly name: string
  start(): void
  stop(): void
  isRunning(): boolean
  /** Sends a key tap with modifiers (used for Ctrl/Cmd+V). */
  tap(keycode: number, modifiers: number[]): void
  lastError(): string | null
  on(event: 'key', listener: (e: NativeKeyEvent) => void): this
  on(event: 'error', listener: (e: Error) => void): this
}

/** Test/fallback implementation that produces no events. */
export class NullInputBridge extends EventEmitter implements NativeInputBridge {
  readonly name = 'null'
  private running = false
  constructor(private readonly reason: string | null = null) {
    super()
  }
  start() {
    this.running = true
  }
  stop() {
    this.running = false
  }
  isRunning() {
    return this.running && !this.reason
  }
  tap() {
    throw new Error(this.reason ?? 'Native input is not available')
  }
  lastError() {
    return this.reason
  }
  /** Lets tests inject key events. */
  emitKey(e: NativeKeyEvent) {
    this.emit('key', e)
  }
}
