import { describe, expect, it } from 'vitest'
import { buildPrompt, expectedScript, isPromptEcho, normalizeTranscript, PRIMING, scriptShare, sentenceCase, wrongScript, hasRepeatedPhrase } from '../../../shared/scripts'
import { chooseAllowedLanguage } from '../../../shared/language-detect'
import { LANGUAGES } from '../../../shared/languages'

describe('scripts', () => {
  it('knows the script of every supported language', () => {
    expect(expectedScript('tg')).toBe('Cyrillic')
    expect(expectedScript('fa')).toBe('Arabic')
    expect(expectedScript('ur')).toBe('Arabic')
    expect(expectedScript('hi')).toBe('Devanagari')
    expect(expectedScript('ja')).toBe('Japanese')
    expect(expectedScript('en')).toBe('Latin')
    for (const l of LANGUAGES) expect(typeof expectedScript(l.code)).toBe('string')
  })

  it('flags Tajik written in Latin letters or Persian script', () => {
    expect(wrongScript('Nomi man Mehridin asman, dardoonishko hmehonam', 'tg')).toBe(true)
    expect(wrongScript('نام من مهرالدین است', 'tg')).toBe(true)
    expect(wrongScript('Номи ман Меҳридин аст, дар донишгоҳ мехонам', 'tg')).toBe(false)
    // A brand name inside Tajik text is fine.
    expect(wrongScript('Ман iPhone-и нав харидам ва хеле хурсандам', 'tg')).toBe(false)
  })

  it('flags Persian in Cyrillic, accepts Persian script', () => {
    expect(wrongScript('سلام، حال شما چطور است؟', 'fa')).toBe(false)
    expect(wrongScript('Салом, ҳоли шумо чӣ тавр аст?', 'fa')).toBe(true)
  })

  it('accepts both Serbian alphabets; ignores short or empty text', () => {
    expect(wrongScript('Добар дан', 'sr')).toBe(false)
    expect(wrongScript('Dobar dan', 'sr')).toBe(false)
    expect(wrongScript('OK', 'ru')).toBe(false)
    expect(wrongScript('', 'tg')).toBe(false)
    expect(scriptShare('...', 'tg')).toBe(1)
  })

  it('always primes Tajik and Persian, other languages only on request', () => {
    expect(buildPrompt('tg', '')).toBe(PRIMING.tg)
    expect(buildPrompt('fa', 'VoiceFlow')).toBe(`${PRIMING.fa} VoiceFlow`)
    expect(buildPrompt('ru', 'VoiceFlow')).toBe('VoiceFlow')
    expect(buildPrompt('uk', '', true)).toBe(PRIMING.uk)
    expect(buildPrompt(null, 'word')).toBe('word')
    // Every priming sentence is itself in the right script.
    for (const [lang, text] of Object.entries(PRIMING)) expect(scriptShare(text, lang), lang).toBeGreaterThan(0.9)
  })

  it('recognises an echo of the priming sentence', () => {
    expect(isPromptEcho('Имрӯз ҳаво хуб аст.', 'tg')).toBe(true)
    expect(isPromptEcho('Номи ман Меҳридин аст', 'tg')).toBe(false)
    expect(isPromptEcho('anything', 'en')).toBe(false)
  })

  it('replaces Latin look-alikes inside Cyrillic words', () => {
    // "мехонaм" with a Latin "a", "дoнишгоҳ" with a Latin "o"
    expect(normalizeTranscript('Ман дар дoнишгоҳ мехонaм', 'tg')).toBe('Ман дар донишгоҳ мехонам')
    expect(normalizeTranscript('Привет, iPhone', 'ru')).toBe('Привет, iPhone')
    expect(normalizeTranscript('Xорошо', 'ru')).toBe('Хорошо')
  })

  it('normalises Persian letters and the می prefix', () => {
    expect(normalizeTranscript('كتاب علي', 'fa')).toBe('کتاب علی')
    expect(normalizeTranscript('من می روم', 'fa')).toBe('من می‌روم')
    expect(normalizeTranscript('آنها نمی دانند', 'fa')).toBe('آنها نمی‌دانند')
  })

  it('capitalises and closes phrases of models without punctuation', () => {
    expect(sentenceCase('дар донишгоҳ мехонам', 'tg')).toBe('Дар донишгоҳ мехонам.')
    expect(sentenceCase('ман омадам!', 'tg')).toBe('Ман омадам!')
    expect(sentenceCase('', 'tg')).toBe('')
  })

  it('keeps Persian as Persian and Tajik as Tajik', () => {
    expect(chooseAllowedLanguage('سلام دوستان', 'tg', ['tg', 'fa', 'ru'])).toBe('fa')
    expect(chooseAllowedLanguage('سلام دوستان', 'fa', ['tg', 'fa', 'ru'])).toBe('fa')
    expect(chooseAllowedLanguage('Салом дӯстон', 'fa', ['tg', 'ru', 'en'])).toBe('tg')
    expect(chooseAllowedLanguage('Салом дӯстон', 'tg', ['tg', 'fa', 'ru'])).toBe('tg')
  })

  it('detects a decoding loop (a run of words written twice)', () => {
    expect(hasRepeatedPhrase('محققان اظهار داشتند که حتی اگر این دم یک دایناسر جوان باشد، باز همین دم یک دایناسر جوان باشد.')).toBe(true)
    expect(hasRepeatedPhrase('Номи ман Меҳридин аст, дар донишгоҳ мехонам.')).toBe(false)
    expect(hasRepeatedPhrase('yes yes yes')).toBe(false)
  })
})
