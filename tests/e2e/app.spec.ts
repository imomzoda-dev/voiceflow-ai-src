/// <reference lib="dom" />
import type {} from "../../shared/api"
import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, completeOnboarding } from './helpers'

const shots = join(__dirname, '..', '..', 'test-results', 'screens')

test('1 · app starts with onboarding, then dashboard', async () => {
  const l = await launch()
  try {
    await expect(l.page.getByText('Welcome to VoiceFlow AI')).toBeVisible()
    await l.page.screenshot({ path: join(shots, 'onboarding.png') })
    await completeOnboarding(l.page)
    await expect(l.page.getByRole('button', { name: 'New document' }).first()).toBeVisible()
    await l.page.screenshot({ path: join(shots, 'dashboard.png') })
  } finally {
    await l.close()
  }
})

test('10/11/12 · create, format, autosave and persist a document across restarts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'voiceflow-e2e-'))
  let l = await launch(dir)
  try {
    await completeOnboarding(l.page)
    await l.page.getByRole('button', { name: 'New document' }).first().click()
    const editor = l.page.locator('.vf-prose')
    await expect(editor).toBeVisible()
    await editor.click()
    await l.page.keyboard.type('Ҳисоботи моҳона')
    // Heading 1 via toolbar menu
    await l.page.getByRole('button', { name: /Paragraph/ }).click()
    await l.page.getByRole('menuitem', { name: 'Heading 1' }).click()
    await l.page.keyboard.press('End')
    await l.page.keyboard.press('Enter')
    await l.page.keyboard.type('Ёқубов Ғ. Ҳ. — Ҷамъбасти кор, Ӯ ва Ӣ.')
    // Table
    await l.page.getByRole('button', { name: 'Table' }).click()
    await l.page.getByRole('menuitem', { name: 'Insert table' }).click()
    await expect(editor.locator('table')).toBeVisible()
    await expect(l.page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 })
    await l.page.screenshot({ path: join(shots, 'editor.png') })
  } finally {
    await l.close({ keepData: true })
  }

  l = await launch(dir)
  try {
    const docs = await l.page.evaluate(() => window.voiceflow.documents.list())
    expect(docs).toHaveLength(1)
    const doc = await l.page.evaluate((id) => window.voiceflow.documents.get(id), docs[0].id)
    expect(doc?.contentText).toContain('Ҳисоботи моҳона')
    expect(doc?.contentText).toContain('Ёқубов Ғ. Ҳ.')
    expect(JSON.stringify(doc?.content)).toContain('"type":"table"')
    expect(JSON.stringify(doc?.content)).toContain('"level":1')
  } finally {
    await l.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('18 · IPC rejects invalid payloads and the renderer has no Node access', async () => {
  const l = await launch()
  try {
    const nodeAccess = await l.page.evaluate(() => typeof (window as unknown as { require?: unknown }).require !== 'undefined' || typeof (globalThis as unknown as { process?: unknown }).process !== 'undefined')
    expect(nodeAccess).toBe(false)
    const err = await l.page.evaluate(async () => {
      try {
        // @ts-expect-error deliberately wrong type
        await window.voiceflow.documents.get(12345)
        return null
      } catch (e) {
        return String(e)
      }
    })
    expect(err).toContain('Invalid request')
    const settingsErr = await l.page.evaluate(async () => {
      try {
        // @ts-expect-error invalid enum value must be rejected by the zod schema
        await window.voiceflow.settings.update('appearance', { theme: 'neon' })
        return null
      } catch (e) {
        return String(e)
      }
    })
    expect(settingsErr).not.toBeNull()
    // Keys never reach the renderer: provider records only expose hasKey.
    const rec = await l.page.evaluate(() =>
      window.voiceflow.providers.upsert({ name: 'Local test', kind: 'openai-compatible', preset: 'ollama', baseUrl: 'http://localhost:11434/v1', chatModel: 'x', transcriptionModel: null, supportsChat: true, supportsTranscription: false, apiKey: 'sk-secret-test-value-123' })
    )
    expect(JSON.stringify(rec)).not.toContain('sk-secret')
    expect(rec.hasKey).toBe(true)
    // Plain-http remote endpoints are refused.
    const httpErr = await l.page.evaluate(async () => {
      try {
        await window.voiceflow.providers.upsert({ name: 'Bad', kind: 'openai-compatible', preset: 'custom', baseUrl: 'http://example.com/v1', chatModel: null, transcriptionModel: null, supportsChat: true, supportsTranscription: false })
        return null
      } catch (e) {
        return String(e)
      }
    })
    expect(httpErr).toContain('https')
  } finally {
    await l.close()
  }
})

test('2/5 · dictation start without a model fails cleanly with a clear error state', async () => {
  const l = await launch()
  try {
    await completeOnboarding(l.page)
    const r = await l.page.evaluate(() => window.voiceflow.dictation.start({ target: 'preview' }))
    expect(r.ok).toBe(false)
    expect(['binary-missing', 'model-missing']).toContain(r.error)
    const st = await l.page.evaluate(() => window.voiceflow.dictation.state())
    expect(st.phase).toBe('error')
    // Returns to idle on its own
    await expect.poll(async () => (await l.page.evaluate(() => window.voiceflow.dictation.state())).phase, { timeout: 8000 }).toBe('idle')
  } finally {
    await l.close()
  }
})

test('19 · tray exists and the global hook is reported', async () => {
  const l = await launch()
  try {
    const status = await l.page.evaluate(() => window.voiceflow.hotkeys.status())
    expect(status.registrations.find((r) => r.action === 'dictate')?.binding?.keycode).toBe(88)
    // libuiohook should start on Windows/macOS (macOS needs Accessibility permission).
    if (process.platform === 'win32') expect(status.nativeHookRunning).toBe(true)
    const trayCount = await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
    expect(trayCount).toBeGreaterThanOrEqual(2) // main + overlay recorder
  } finally {
    await l.close()
  }
})

test('UI renders in Russian and Tajik; settings sections open', async () => {
  const l = await launch()
  try {
    await completeOnboarding(l.page)
    await l.page.evaluate(() => window.voiceflow.settings.update('general', { uiLanguage: 'ru' }))
    await expect(l.page.getByRole('button', { name: 'Новый документ' }).first()).toBeVisible()
    await l.page.evaluate(() => window.voiceflow.settings.update('general', { uiLanguage: 'tg' }))
    await expect(l.page.getByRole('button', { name: 'Ҳуҷҷати нав' }).first()).toBeVisible()
    await l.page.evaluate(() => window.voiceflow.settings.update('general', { uiLanguage: 'en' }))
    await l.page.getByRole('button', { name: 'Settings' }).click()
    for (const s of ['Voice', 'Recognition', 'AI Writing', 'AI Providers', 'Privacy', 'Backup', 'About']) {
      await l.page.getByRole('button', { name: s, exact: true }).click()
      await expect(l.page.getByRole('heading', { name: s, exact: true })).toBeVisible()
    }
    await l.page.getByRole('button', { name: 'Recognition', exact: true }).click()
    await l.page.screenshot({ path: join(shots, 'settings-recognition.png') })
    await l.page.evaluate(() => window.voiceflow.settings.update('appearance', { theme: 'dark' }))
    await l.page.getByRole('button', { name: 'Voice Typing' }).click()
    await l.page.screenshot({ path: join(shots, 'voice-dark.png') })
  } finally {
    await l.close()
  }
})
