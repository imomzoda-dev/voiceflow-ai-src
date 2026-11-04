/**
 * Inserts text into the app that currently has keyboard focus:
 * clipboard snapshot → write text → wait for hotkey modifiers to be released → Ctrl/Cmd+V →
 * restore the user's previous clipboard.
 *
 * Known OS limits (documented, not hidden):
 *  - Windows: a non-elevated app cannot send input to an elevated (Run as administrator) window (UIPI).
 *  - macOS: synthesising Cmd+V needs Accessibility permission.
 *  - Some secure fields (password boxes, some terminals) ignore synthetic paste.
 */
import { clipboard, ClipboardItem } from 'electron'
import type { NativeInputBridge } from '../native/input-bridge'
import { createLogger } from '../main/logger'

const log = createLogger('typing')

const KEY_V = 47
const KEY_CTRL = 29
const KEY_META = 3675

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Electron 45 exposes an async, W3C-style clipboard (read()/write() of ClipboardItems). */
type ClipboardSnapshot = { items: { type: string; data: Blob | string }[][] }

export class ClipboardService {
  async snapshot(): Promise<ClipboardSnapshot> {
    const out: ClipboardSnapshot = { items: [] }
    try {
      for (const item of await clipboard.read()) {
        const entries: { type: string; data: Blob | string }[] = []
        for (const type of item.types) {
          try {
            const data = await item.getType(type)
            if (data instanceof Blob) entries.push({ type, data })
          } catch {
            /* format not readable — skip */
          }
        }
        if (entries.length) out.items.push(entries)
      }
    } catch (e) {
      log.warn('Clipboard snapshot failed', e)
    }
    return out
  }

  async restore(s: ClipboardSnapshot) {
    if (!s.items.length) {
      await clipboard.clear()
      return
    }
    await clipboard.write(s.items.map((entries) => new ClipboardItem(Object.fromEntries(entries.map((e) => [e.type, e.data])))))
  }

  async readText(): Promise<string> {
    return clipboard.readText()
  }

  async writeText(text: string) {
    await clipboard.writeText(text)
  }
}

export class TypingService {
  constructor(
    private readonly bridge: NativeInputBridge,
    private readonly clip: ClipboardService,
    private readonly modifiersDown: () => boolean,
    private readonly platform: NodeJS.Platform = process.platform,
    /** macOS: synthetic key events are silently dropped without Accessibility permission. */
    private readonly canSynthesize: () => boolean = () => true
  ) {}

  canPaste(): boolean {
    return this.bridge.isRunning()
  }

  async insert(text: string, opts: { restoreClipboard: boolean }): Promise<{ ok: boolean; method: 'paste' | 'clipboard'; error?: string }> {
    const snapshot = opts.restoreClipboard ? await this.clip.snapshot() : null
    await this.clip.writeText(text)
    if (!this.bridge.isRunning()) {
      return { ok: false, method: 'clipboard', error: 'Native input is unavailable; the text was copied to the clipboard instead.' }
    }
    if (!this.canSynthesize()) {
      return { ok: false, method: 'clipboard', error: 'accessibility' }
    }
    // Wait (max 1.5 s) for the user to release Ctrl/Alt/Shift from the hotkey, otherwise
    // the synthetic V would combine into e.g. Ctrl+Shift+V.
    const deadline = Date.now() + 1500
    while (this.modifiersDown() && Date.now() < deadline) await sleep(25)
    await sleep(30)
    try {
      this.bridge.tap(KEY_V, [this.platform === 'darwin' ? KEY_META : KEY_CTRL])
    } catch (e) {
      log.error('Synthetic paste failed', e)
      return { ok: false, method: 'clipboard', error: 'Could not simulate paste; the text is on the clipboard.' }
    }
    if (snapshot) {
      // Give the target app time to read the clipboard before restoring it.
      await sleep(this.platform === 'darwin' ? 350 : 250)
      try {
        if ((await this.clip.readText()) === text) await this.clip.restore(snapshot)
      } catch (e) {
        log.warn('Clipboard restore failed', e)
      }
    }
    return { ok: true, method: 'paste' }
  }
}
