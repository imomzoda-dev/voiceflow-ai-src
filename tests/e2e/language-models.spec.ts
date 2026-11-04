/// <reference lib="dom" />
import type {} from '../../shared/api'
import { test, expect } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, completeOnboarding } from './helpers'

/**
 * Language models in Settings → Recognition (opt-in, needs a Tajik model file):
 *   VOICEFLOW_TAJIK_MODEL=<path to ggml-tajik-small-q5_1.bin> npx playwright test language-models
 * Without the model the card suggests it; with it, the row says it is used for Tajik.
 */
const model = process.env.VOICEFLOW_TAJIK_MODEL
const shots = process.env.VOICEFLOW_SHOTS_DIR

test('Tajik language model: suggestion card, then "used for Tajik"', async () => {
  test.skip(!model || !existsSync(model), 'set VOICEFLOW_TAJIK_MODEL')
  const l = await launch()
  try {
    const p = l.page
    await completeOnboarding(p)
    await p.evaluate(() => window.voiceflow.settings.update('recognition', { allowedLanguages: ['tg', 'fa', 'en'], language: 'tg' }))
    const open = async () => {
      await p.getByRole('button', { name: 'Settings', exact: true }).first().click()
      await p.getByRole('button', { name: 'Recognition', exact: true }).first().click()
      await p.waitForTimeout(500)
    }
    await open()
    await expect(p.getByText('Model for Тоҷикӣ')).toBeVisible()
    if (shots) await p.screenshot({ path: join(shots, 'models-suggest.png') })

    // Install the model file as a download would.
    mkdirSync(join(l.userData, 'models'), { recursive: true })
    copyFileSync(model!, join(l.userData, 'models', 'ggml-tajik-small-q5_1.bin'))
    await p.reload()
    await open()
    await expect(p.getByText('Model for Тоҷикӣ')).toHaveCount(0)
    await expect(p.getByText('Used for Тоҷикӣ')).toBeVisible()
    await expect(p.getByText('abduaziz/whisper-small-tajik · Apache-2.0')).toBeVisible()
    if (shots) await p.getByText('Used for Тоҷикӣ').scrollIntoViewIfNeeded()
    if (shots) await p.screenshot({ path: join(shots, 'models-installed.png') })
  } finally {
    await l.close()
  }
})
