import { describe, it, expect } from 'vitest'
import { detectFragment, detectLanguages, chooseAllowedLanguage } from '../../../shared/language-detect'
import { normalizeLanguageCode } from '../../../shared/languages'
import { applyDictionary, buildVocabularyPrompt, type DictionaryEntry } from '../../../shared/dictionary'
import { parseVoiceCommand } from '../../../shared/voice-commands'
import { diffWords } from '../../../shared/diff'

describe('language detection', () => {
  it('recognises Tajik by its distinctive letters', () => {
    expect(detectFragment('Ман имрӯз ба мактаб рафтам ва дарсҳоро хондам.')).toBe('tg')
    expect(detectFragment('Ҷумҳурии Тоҷикистон')).toBe('tg')
  })
  it('recognises Russian, English, Turkish, Uzbek and Arabic', () => {
    expect(detectFragment('Сегодня я пишу отчёт для руководства.')).toBe('ru')
    expect(detectFragment('Today I am writing the quarterly report.')).toBe('en')
    expect(detectFragment('Bugün çok güzel bir gün, değil mi?')).toBe('tr')
    expect(detectFragment("Men bugun o'qishga bordim, gʻalaba qozondik")).toBe('uz')
    expect(detectFragment('مرحبا بكم في التطبيق')).toBe('ar')
  })
  it('segments mixed Russian / English / Tajik dictation without translating it', () => {
    const text = 'Привет, коллеги. This is the new release. Ман ҳисоботро фардо мефиристам.'
    const r = detectLanguages(text)
    expect(r.languages).toEqual(['ru', 'en', 'tg'])
    expect(r.segments.map((s) => s.text).join('')).toBe(text)
    expect(r.source).toBe('text-heuristic')
    expect(r.engineProbability).toBeUndefined()
  })
  it('keeps the engine language but overrides an obvious Whisper ru→tg confusion', () => {
    expect(detectLanguages('Сегодня хорошая погода', { language: 'ru', probability: 0.91 })).toMatchObject({ language: 'ru', source: 'engine', engineProbability: 0.91 })
    const tg = detectLanguages('Ҳаво имрӯз хеле хуб аст, мо ба кӯҳ меравем.', { language: 'ru', probability: 0.6 })
    expect(tg.language).toBe('tg')
    expect(tg.source).toBe('text-heuristic')
    expect(tg.engineProbability).toBeUndefined()
  })
  it('chooses an allowed language when the engine picked something else', () => {
    expect(chooseAllowedLanguage('салом', 'fa', ['tg', 'ru'])).toBe('tg')
    expect(chooseAllowedLanguage('hello', 'en', ['tg', 'en'])).toBe('en')
  })
  it('normalises engine language names', () => {
    expect(normalizeLanguageCode('russian')).toBe('ru')
    expect(normalizeLanguageCode('Tajik')).toBe('tg')
    expect(normalizeLanguageCode('auto')).toBeNull()
  })
})

describe('personal dictionary', () => {
  const entries: DictionaryEntry[] = [
    { id: '1', original: 'войс флоу', preferred: 'VoiceFlow', language: null, alias: 'voice flow, войсфлоу', category: 'company' },
    { id: '2', original: 'Ёкубов', preferred: 'Ёқубов', language: 'tg', alias: null, category: 'surname' }
  ]
  it('replaces whole-word variants case-insensitively, Unicode-aware', () => {
    expect(applyDictionary('Я работаю в Войс Флоу и voice flow.', entries, 'ru').text).toBe('Я работаю в VoiceFlow и VoiceFlow.')
    expect(applyDictionary('Ёкубов омад', entries, 'tg').text).toBe('Ёқубов омад')
    // Language-scoped entries don't apply to other languages, and substrings are not touched.
    expect(applyDictionary('Ёкубов', entries, 'ru').text).toBe('Ёкубов')
    expect(applyDictionary('Ёкубовҳо', entries, 'tg').text).toBe('Ёкубовҳо')
  })
  it('builds a bounded vocabulary prompt', () => {
    expect(buildVocabularyPrompt(entries, 'tg')).toBe('VoiceFlow, Ёқубов')
    expect(buildVocabularyPrompt(entries, 'ru')).toBe('VoiceFlow')
  })
})

describe('voice commands', () => {
  it('only triggers on whole-utterance matches', () => {
    expect(parseVoiceCommand('Новый абзац.')).toEqual({ kind: 'editor', command: 'newParagraph' })
    expect(parseVoiceCommand('абзаци нав')).toEqual({ kind: 'editor', command: 'newParagraph' })
    expect(parseVoiceCommand('Переведи на английский!')).toEqual({ kind: 'ai', command: 'translateEn' })
    expect(parseVoiceCommand('Я начал новый абзац в своей книге')).toBeNull()
    expect(parseVoiceCommand('Сохранить документ')).toEqual({ kind: 'editor', command: 'save' })
  })
})

describe('word diff', () => {
  it('produces added/removed parts that reconstruct both texts', () => {
    const a = 'я пашол домой'
    const b = 'Я пошёл домой.'
    const parts = diffWords(a, b)
    expect(parts.filter((p) => p.type !== 'added').map((p) => p.text).join('')).toBe(a)
    expect(parts.filter((p) => p.type !== 'removed').map((p) => p.text).join('')).toBe(b)
  })
})
