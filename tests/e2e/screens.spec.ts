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
      const t = (text: string, marks?: string[]) => (marks ? { type: 'text', text, marks: marks.map((m) => ({ type: m })) } : { type: 'text', text })
      const p = (...c: object[]) => ({ type: 'paragraph', content: c })
      const cell = (text: string, h = false) => ({ type: h ? 'tableHeader' : 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [p(t(text))] })
      for (const [title, text] of docs) {
        const rich = title === 'Product notes'
        const content = rich
          ? [
              { type: 'heading', attrs: { level: 1 }, content: [t('Ҳисоботи ҳафтаина — VoiceFlow AI')] },
              p(t('Ин ҳафта мо '), t('диктанти овозӣ', ['bold']), t(' -ро дар ҳамаи барномаҳо санҷидем. Натиҷаҳо хеле хуб буданд, '), t('махсусан барои забони тоҷикӣ', ['italic']), t('.')),
              { type: 'heading', attrs: { level: 2 }, content: [t('Натиҷаҳо')] },
              { type: 'bulletList', content: ['Шинохти нутқ: Large v3 Turbo', 'Ислоҳи грамматика бо AI', 'Содирот ба DOCX ва PDF'].map((x) => ({ type: 'listItem', content: [p(t(x))] })) },
              { type: 'table', content: [{ type: 'tableRow', content: [cell('Вазифа', true), cell('Масъул', true), cell('Мӯҳлат', true)] }, { type: 'tableRow', content: [cell('Санҷиши диктант'), cell('Дастаи QA'), cell('Душанбе')] }, { type: 'tableRow', content: [cell('Тарҷумаи интерфейс'), cell('Мадина'), cell('Чоршанбе')] }, { type: 'tableRow', content: [cell('Насри версияи нав'), cell('Ҷамшед'), cell('Ҷумъа')] }] },
              { type: 'blockquote', content: [p(t('Овози шумо. Суханони шумо. Зеҳни шумо.'))] }
            ]
          : [{ type: 'heading', attrs: { level: 1 }, content: [t(title)] }, p(t(text))]
        const d = await api.documents.create({ title, content: { type: 'doc', content } })
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

// The island during a real dictation (needs the speech profile from speech.spec.ts).
test('island screenshots during a real dictation', async () => {
  const dir = process.env.VOICEFLOW_SPEECH_DIR
  test.skip(!process.env.VOICEFLOW_SCREENS || !dir, 'set VOICEFLOW_SCREENS=1 and VOICEFLOW_SPEECH_DIR')
  test.setTimeout(120_000)
  const l = await launch(join(dir!, 'profile'), ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${join(dir!, 'ru.wav')}`])
  try {
    const p = l.page
    await completeOnboarding(p)
    await p.evaluate(() => window.voiceflow.settings.update('writing', { mode: 'raw' }))
    await p.evaluate(() => window.voiceflow.settings.update('general', { uiLanguage: 'en' }))
    await p.evaluate(() => window.voiceflow.dictation.start({ target: 'preview' }))
    const overlay = l.app.windows().find((w) => w.url().includes('overlay.html'))!
    await p.waitForTimeout(2600)
    await overlay.screenshot({ path: join(out, 'v2-island-recording.png'), omitBackground: true })
    await p.waitForTimeout(3000)
    await p.evaluate(() => window.voiceflow.dictation.stop())
    await p.waitForTimeout(250)
    await overlay.screenshot({ path: join(out, 'v2-island-processing.png'), omitBackground: true })
    for (let i = 0; i < 60; i++) {
      if ((await p.evaluate(() => window.voiceflow.dictation.state())).phase === 'success') break
      await p.waitForTimeout(100)
    }
    await p.waitForTimeout(450) // let the orb finish its colour/icon transition
    await overlay.screenshot({ path: join(out, 'v2-island-success.png'), omitBackground: true })
  } finally {
    await l.close({ keepData: true })
  }
})
