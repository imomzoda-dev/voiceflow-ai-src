/// <reference lib="dom" />
import type {} from '../../shared/api'
import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { launch, completeOnboarding } from './helpers'

/**
 * Real speech test (opt-in: downloads whisper.cpp + a model).
 *   VOICEFLOW_SPEECH_DIR=<folder with ru.wav / en.wav and a reusable profile> npx playwright test speech
 * Audio is fed through Chromium's fake microphone, so the full pipeline runs:
 * getUserMedia → AudioWorklet → 16 kHz WAV → IPC → whisper.cpp → language detection → result.
 */
const dir = process.env.VOICEFLOW_SPEECH_DIR
const MODEL = process.env.VOICEFLOW_SPEECH_MODEL ?? 'base'

const cases = [
  { file: 'ru.wav', lang: 'ru', expectWords: ['обсудили', 'план', 'неделю', 'задачи'] },
  { file: 'en.wav', lang: 'en', expectWords: ['test', 'voice', 'typing', 'document'] }
]

for (const c of cases) {
  test(`6/8 · real dictation via whisper.cpp (${c.lang})`, async () => {
    test.skip(!dir || !existsSync(join(dir ?? '', c.file)), 'set VOICEFLOW_SPEECH_DIR to run')
    test.setTimeout(20 * 60_000)
    const profile = join(dir!, 'profile')
    mkdirSync(profile, { recursive: true })
    const l = await launch(profile, ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${join(dir!, c.file)}`])
    try {
      const p = l.page
      await completeOnboarding(p)
      let bin = await p.evaluate(() => window.voiceflow.models.binaryStatus())
      if (!bin.found) {
        const r = await p.evaluate(() => window.voiceflow.models.installBinary())
        expect(r.ok, r.error).toBe(true)
        bin = await p.evaluate(() => window.voiceflow.models.binaryStatus())
      }
      expect(bin.found).toBe(true)
      const catalog = await p.evaluate(() => window.voiceflow.models.catalog())
      if (!catalog.find((m) => m.id === MODEL)?.installed) {
        const r = await p.evaluate((id) => window.voiceflow.models.download(id), MODEL)
        expect(r.ok, r.error).toBe(true)
      }
      const model = (await p.evaluate(() => window.voiceflow.models.catalog())).find((m) => m.id === MODEL)!
      console.log(`whisper-cli: ${bin.path} (${bin.version ?? 'unknown version'}) · model ${MODEL} verified=${model.verified}`)
      // Your languages: Tajik (default), Russian, English. The picker chooses this clip's language.
      await p.evaluate((m) => window.voiceflow.settings.update('recognition', { speechProviderId: 'whisper-cpp', whisperModel: m, languageMode: 'multiple', language: 'tg', allowedLanguages: ['tg', 'ru', 'en'] }), MODEL)
      await p.evaluate(() => window.voiceflow.settings.update('writing', { mode: 'raw' }))
      await p.evaluate(() => window.voiceflow.settings.update('voice', { languagePicker: true, pickerSeconds: 2, liveTyping: true }))

      const started = Date.now()
      const s = await p.evaluate(() => window.voiceflow.dictation.start({ target: 'preview' }))
      expect(s.ok, s.error).toBe(true)
      const pick = await p.evaluate(() => window.voiceflow.dictation.state())
      expect(pick.phase).toBe('selecting')
      expect(pick.pickLanguages).toEqual(['tg', 'ru', 'en'])
      await p.evaluate((i) => window.voiceflow.dictation.pick(i), c.lang === 'ru' ? 1 : 2)
      await expect.poll(async () => (await p.evaluate(() => window.voiceflow.dictation.state())).phase).toBe('recording')
      // Record exactly the clip length: Chromium's fake microphone loops the file.
      const clipMs = ((statSync(join(dir!, c.file)).size - 44) / (48000 * 2)) * 1000
      await p.waitForTimeout(clipMs + 150)
      await p.evaluate(() => window.voiceflow.dictation.stop())
      await expect.poll(async () => (await p.evaluate(() => window.voiceflow.dictation.state())).phase, { timeout: 180_000, intervals: [500] }).toMatch(/success|error|idle/)
      const st = await p.evaluate(() => window.voiceflow.dictation.state())
      const hist = await p.evaluate(() => window.voiceflow.history.list({ limit: 1 }))
      const rec = hist.items[0]
      console.log(`[${c.lang}] phase=${st.phase} error=${st.errorCode ?? '-'} lang=${rec?.language} total=${Date.now() - started}ms\n  → ${rec?.finalText}`)
      expect(rec?.status).toBe('success')
      expect(rec?.language).toBe(c.lang)
      const text = rec!.finalText.toLowerCase()
      const hits = c.expectWords.filter((w) => text.includes(w))
      expect(hits.length, `recognised: ${rec!.finalText}`).toBeGreaterThanOrEqual(3)
    } finally {
      await l.close({ keepData: true })
    }
  })
}
