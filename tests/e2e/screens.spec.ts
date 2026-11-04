/// <reference lib="dom" />
import type {} from '../../shared/api'
import { test } from '@playwright/test'
import { join } from 'node:path'
import { launch, completeOnboarding } from './helpers'

// Visual review screenshots (opt-in): VOICEFLOW_SCREENS=1 npx playwright test screens
const out = join(__dirname, '..', '..', 'test-results', 'screens')

test('screenshots of every screen (light + dark)', async () => {
  test.skip(!process.env.VOICEFLOW_SCREENS, 'set VOICEFLOW_SCREENS=1')
  test.setTimeout(120_000)
  const l = await launch()
  const p = l.page
  try {
    await p.setViewportSize({ width: 1320, height: 840 })
    await p.waitForTimeout(400)
    await p.screenshot({ path: join(out, 'v2-onboarding.png') })
    await completeOnboarding(p)
    await p.evaluate(async () => {
      const api = window.voiceflow
      const docs = [
        ['Ҳисоботи моҳона', 'Ҷамъбасти кори моҳи октябр: лоиҳаҳо, натиҷаҳо ва нақшаҳо барои моҳи оянда.'],
        ['План на неделю', 'Обсудить релиз, подготовить презентацию, созвониться с командой дизайна.'],
        ['Product notes', 'Voice typing should feel instant. The island widget must never steal focus.']
      ]
      for (const [title, text] of docs) {
        const d = await api.documents.create({ title, content: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] }, { type: 'paragraph', content: [{ type: 'text', text }] }] } })
        await api.documents.markOpened(d.id)
      }
      await api.documents.setFavorite((await api.documents.list())[0].id, true)
    })
    const shoot = async (name: string, nav?: () => Promise<void>) => {
      if (nav) await nav()
      await p.waitForTimeout(450)
      await p.screenshot({ path: join(out, `v2-${name}.png`) })
    }
    const click = (name: string) => () => p.getByRole('button', { name, exact: true }).first().click()
    for (const theme of ['light', 'dark'] as const) {
      await p.evaluate((th) => window.voiceflow.settings.update('appearance', { theme: th }), theme)
      await shoot(`${theme}-dashboard`, click('Dashboard'))
      await shoot(`${theme}-documents`, click('Documents'))
      await shoot(`${theme}-voice`, click('Voice Typing'))
      await shoot(`${theme}-settings-general`, click('Settings'))
      await shoot(`${theme}-settings-voice`, click('Voice'))
      await shoot(`${theme}-settings-appearance`, click('Appearance'))
      await click('Documents')()
      await p.getByRole('button', { name: 'Product notes' }).first().click()
      await shoot(`${theme}-editor`)
      await p.keyboard.press('Control+K')
      await shoot(`${theme}-palette`)
      await p.keyboard.press('Escape')
    }
    // Dictation island in the overlay window (error state: no model installed)
    await p.evaluate(() => window.voiceflow.dictation.start({ target: 'preview' }))
    const overlay = l.app.windows().find((w) => w.url().includes('overlay.html'))
    if (overlay) {
      await p.waitForTimeout(500)
      await overlay.screenshot({ path: join(out, 'v2-island-error.png') })
    }
  } finally {
    await l.close()
  }
})
