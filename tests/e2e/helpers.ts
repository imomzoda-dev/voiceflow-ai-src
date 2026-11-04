/// <reference lib="dom" />
import type {} from "../../shared/api"
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
  close(opts?: { keepData?: boolean }): Promise<void>
}

/** Launches the built app (out/) with an isolated, throw-away profile. */
export async function launch(userData = mkdtempSync(join(tmpdir(), 'voiceflow-e2e-')), extraArgs: string[] = []): Promise<Launched> {
  const app = await electron.launch({
    args: [join(__dirname, '..', '..'), ...extraArgs],
    env: { ...process.env, VOICEFLOW_USER_DATA: userData, VOICEFLOW_QUIET: '1', NODE_ENV: 'production' }
  })
  // The first window is the main window (the overlay is created afterwards and stays hidden).
  const page = await firstMainWindow(app)
  await page.waitForLoadState('domcontentloaded')
  return {
    app,
    page,
    userData,
    async close(opts) {
      await app.evaluate(({ app: a }) => {
        a.exit(0)
      }).catch(() => undefined)
      await app.close().catch(() => undefined)
      if (!opts?.keepData) rmSync(userData, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    }
  }
}

async function firstMainWindow(app: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 50; i++) {
    for (const w of app.windows()) if (w.url().includes('index.html')) return w
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('Main window did not open')
}

/** Skips onboarding through the real settings API. */
export async function completeOnboarding(page: Page) {
  await page.evaluate(() => window.voiceflow.settings.update('general', { onboardingCompleted: true }))
}
