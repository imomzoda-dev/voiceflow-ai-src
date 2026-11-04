/// <reference lib="dom" />
import type {} from "../../shared/api"
import { test, expect, _electron as electron } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Smoke-tests the unpacked build from `npm run dist:win` / `dist:dir` (skipped if it hasn't been built).
const exe = process.platform === 'darwin'
  ? join(__dirname, '..', '..', 'release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'VoiceFlow AI.app', 'Contents', 'MacOS', 'VoiceFlow AI')
  : join(__dirname, '..', '..', 'release', 'win-unpacked', 'VoiceFlow AI.exe')

test('packaged app starts, runs migrations and loads the native hook', async () => {
  test.skip(!existsSync(exe), 'packaged build not present')
  const userData = mkdtempSync(join(tmpdir(), 'voiceflow-pkg-'))
  const app = await electron.launch({ executablePath: exe, env: { ...process.env, VOICEFLOW_USER_DATA: userData, VOICEFLOW_QUIET: '1' } })
  try {
    let page = app.windows().find((w) => w.url().includes('index.html'))
    for (let i = 0; !page && i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200))
      page = app.windows().find((w) => w.url().includes('index.html'))
    }
    expect(page).toBeTruthy()
    const templates = await page!.evaluate(() => window.voiceflow.templates.list())
    expect(templates.length).toBe(10)
    const status = await page!.evaluate(() => window.voiceflow.hotkeys.status())
    // macOS CI runners have no Accessibility permission, so the hook can only be checked on Windows.
    if (process.platform === 'win32') expect(status.nativeHookRunning).toBe(true)
    const info = await page!.evaluate(() => window.voiceflow.system.info())
    expect(info.isPackaged).toBe(true)
    const upd = await page!.evaluate(() => window.voiceflow.updates.get())
    expect(upd.phase).not.toBe('unsupported')
    expect(upd.currentVersion).toBe(info.version)
  } finally {
    await app.evaluate(({ app: a }) => a.exit(0)).catch(() => undefined)
    await app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
