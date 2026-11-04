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

// Your languages for each case and which one the picker chooses. tg.wav / fa.wav: Google FLEURS (CC BY 4.0).
// The Tajik case uses the Tajik language model when it is in the profile (ggml-tajik-small-q5_1.bin).
const cases = [
  { file: 'ru.wav', lang: 'ru', langs: ['tg', 'ru', 'en'], expectWords: ['обсудили', 'план', 'неделю', 'задачи'] },
  { file: 'en.wav', lang: 'en', langs: ['tg', 'ru', 'en'], expectWords: ['test', 'voice', 'typing', 'document'] },
  { file: 'tg.wav', lang: 'tg', langs: ['tg', 'ru', 'en'], expectWords: ['муқоиса', 'маълумоти', 'ҷойҳо', 'дастрас', 'пешниҳодгардида', 'мебошанд'], script: /\p{Script=Cyrillic}/u },
  { file: 'fa.wav', lang: 'fa', langs: ['fa', 'tg', 'en'], expectWords: ['محققان', 'داشتند', 'نمونه', 'حیوان', 'جوجه'], script: /\p{Script=Arabic}/u }
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
      await p.evaluate(([m, langs]) => window.voiceflow.settings.update('recognition', { speechProviderId: 'whisper-cpp', whisperModel: m, languageMode: 'multiple', language: langs[0], allowedLanguages: langs, languageModels: true }), [MODEL, c.langs] as const)
      await p.evaluate(() => window.voiceflow.settings.update('writing', { mode: 'raw' }))
      // VOICEFLOW_SAVE_AUDIO=1 keeps each phrase's WAV in <profile>/audio for inspection.
      await p.evaluate((keep) => window.voiceflow.settings.update('storage', { saveAudio: keep }), !!process.env.VOICEFLOW_SAVE_AUDIO)
      await p.evaluate(() => window.voiceflow.settings.update('voice', { languagePicker: true, pickerSeconds: 2, liveTyping: true }))

      const started = Date.now()
      const s = await p.evaluate(() => window.voiceflow.dictation.start({ target: 'preview' }))
      expect(s.ok, s.error).toBe(true)
      const pick = await p.evaluate(() => window.voiceflow.dictation.state())
      expect(pick.phase).toBe('selecting')
      expect(pick.pickLanguages).toEqual(c.langs)
      await p.evaluate((i) => window.voiceflow.dictation.pick(i), c.langs.indexOf(c.lang))
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
      expect(hits.length, `recognised: ${rec!.finalText}`).toBeGreaterThanOrEqual(Math.min(4, c.expectWords.length - 1))
      if (c.script) {
        // Every letter in the language's own alphabet (no Latin or Persian letters in Tajik, and vice versa).
        const letters = [...rec!.finalText].filter((ch) => /\p{L}/u.test(ch))
        expect(letters.filter((ch) => c.script!.test(ch)).length / letters.length, rec!.finalText).toBeGreaterThan(0.97)
      }
    } finally {
      await l.close({ keepData: true })
    }
  })
}
