/// <reference lib="dom" />
import type {} from '../../shared/api'
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, completeOnboarding } from './helpers'

/**
 * macOS window materials on a real Mac (CI): Liquid Glass, Classic and Solid in light and dark.
 * - The native material must follow the app's theme (nativeTheme.themeSource): a light app never
 *   gets a dark sidebar, whatever the Mac's own appearance.
 * - Real window screenshots (`screencapture -l`, which includes the native material behind the page)
 *   go to test-results/mac-glass for review.
 */
test('macOS: Liquid Glass, Classic and Solid follow the app theme', async () => {
  test.skip(process.platform !== 'darwin', 'macOS only')
  test.setTimeout(120_000)
  const out = join(__dirname, '..', '..', 'test-results', 'mac-glass')
  mkdirSync(out, { recursive: true })
  const l = await launch()
  try {
    const p = l.page
    await completeOnboarding(p)
    await l.app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'VoiceFlow AI')!
      w.setSize(1280, 800)
      w.center()
      w.show()
      w.focus()
    })
    await p.getByRole('button', { name: 'Settings', exact: true }).first().click()
    await p.getByRole('button', { name: 'Appearance', exact: true }).first().click()
    for (const theme of ['light', 'dark'] as const) {
      for (const material of ['liquid', 'vibrancy', 'solid'] as const) {
        await p.evaluate(([t, m]) => window.voiceflow.settings.update('appearance', { theme: t, windowMaterial: m }), [theme, material] as const)
        if (theme === 'dark') await expect(p.locator('html')).toHaveClass(/\bdark\b/)
        else await expect(p.locator('html')).not.toHaveClass(/\bdark\b/)
        if (material === 'liquid') await expect(p.locator('html')).toHaveClass(/mat-liquid/)
        else await expect(p.locator('html')).not.toHaveClass(/mat-liquid/)
        if (material === 'solid') await expect(p.locator('html')).not.toHaveClass(/\bvibrancy\b/)
        // The native material and menus use the app's theme, not the Mac's.
        const native = await l.app.evaluate(({ nativeTheme }) => ({ source: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors }))
        expect(native).toEqual({ source: theme, dark: theme === 'dark' })
        await p.waitForTimeout(700)
        const id = await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'VoiceFlow AI')!.getMediaSourceId())
        const windowId = id.split(':')[1]
        const file = join(out, `mac-${material}-${theme}.png`)
        try {
          execFileSync('screencapture', ['-x', '-o', `-l${windowId}`, file])
        } catch {
          await p.screenshot({ path: file })
        }
      }
    }
    // The picker on the Appearance page offers the three materials on a Mac.
    await expect(p.getByText('Liquid Glass', { exact: true })).toBeVisible()
  } finally {
    await l.close()
  }
})
