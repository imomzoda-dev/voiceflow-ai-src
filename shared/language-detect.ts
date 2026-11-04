/**
 * Text-based language detection used alongside the speech engine's own detection.
 *
 * Whisper detects ONE language per request (from the first ~30 s of audio). For mixed
 * Tajik/Russian/English dictation we additionally classify each sentence by script and
 * distinctive letters. This is a heuristic: results are labelled `source: 'text-heuristic'`
 * and never carry an invented confidence score.
 */

export type DetectionSource = 'engine' | 'text-heuristic' | 'user'

export interface LanguageSegment {
  text: string
  language: string | null
}

export interface DetectionResult {
  /** Primary language of the whole text. */
  language: string | null
  source: DetectionSource
  /** Engine-reported probability, only when the engine actually provided one. */
  engineProbability?: number
  segments: LanguageSegment[]
  /** Distinct languages found across segments, in order of first appearance. */
  languages: string[]
}

// Letters that exist in Tajik Cyrillic but not in Russian.
const TAJIK_ONLY = /[ғқӯҳҷӣҒҚӮҲҶӢ]/u
// Letters used in Russian but absent from (native) Tajik orthography.
const RUSSIAN_ONLY = /[щыьэцЩЫЬЭЦ]/u
const KAZAKH_ONLY = /[әіңүұөһӘІҢҮҰӨҺ]/u
const UKRAINIAN_ONLY = /[іїєґІЇЄҐ]/u
const CYRILLIC = /\p{Script=Cyrillic}/u
const ARABIC_SCRIPT = /\p{Script=Arabic}/u
const PERSIAN_ONLY = /[پچژگکی]/u
const LATIN = /\p{Script=Latin}/u
const TURKISH_ONLY = /[ğışİĞŞ]/u
const UZBEK_MARKERS = /(oʻ|gʻ|o‘|g‘|o'|g')/iu
const AZERI_ONLY = /[əƏ]/u

function letterCount(text: string, re: RegExp): number {
  let n = 0
  for (const ch of text) if (re.test(ch)) n++
  return n
}

/** Classifies a single sentence/fragment. Returns null when there is not enough signal. */
export function detectFragment(text: string, hint?: string | null): string | null {
  const cyr = letterCount(text, CYRILLIC)
  const lat = letterCount(text, LATIN)
  const arb = letterCount(text, ARABIC_SCRIPT)
  const total = cyr + lat + arb
  if (total < 2) return null

  if (arb >= cyr && arb >= lat) {
    return PERSIAN_ONLY.test(text) ? 'fa' : 'ar'
  }
  if (cyr >= lat) {
    if (TAJIK_ONLY.test(text)) return 'tg'
    if (KAZAKH_ONLY.test(text) && !TAJIK_ONLY.test(text)) return hint === 'kk' || hint === 'ky' ? hint : 'kk'
    if (UKRAINIAN_ONLY.test(text)) return 'uk'
    if (RUSSIAN_ONLY.test(text)) return 'ru'
    // Ambiguous Cyrillic (no distinctive letters): trust the engine hint when it is Cyrillic-based.
    if (hint && ['tg', 'ru', 'uk', 'be', 'kk', 'ky', 'bg', 'sr', 'mk', 'mn'].includes(hint)) return hint
    return 'ru'
  }
  if (TURKISH_ONLY.test(text)) return 'tr'
  if (AZERI_ONLY.test(text)) return 'az'
  if (UZBEK_MARKERS.test(text)) return 'uz'
  if (hint && !['tg', 'ru', 'ar', 'fa', 'uk', 'kk'].includes(hint)) return hint
  return 'en'
}

/** Splits into sentence-like fragments, keeping punctuation attached. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?…;\n]+[.!?…;]*\s*|\n+/gu) ?? []
  return parts.map((p) => p).filter((p) => p.trim().length > 0)
}

export function detectLanguages(
  text: string,
  engine?: { language: string | null; probability?: number }
): DetectionResult {
  const hint = engine?.language ?? null
  const fragments = splitSentences(text)
  const segments: LanguageSegment[] = []
  for (const f of fragments) {
    const lang = detectFragment(f, hint)
    const prev = segments[segments.length - 1]
    if (prev && prev.language === lang) prev.text += f
    else segments.push({ text: f, language: lang })
  }
  const languages: string[] = []
  for (const s of segments) if (s.language && !languages.includes(s.language)) languages.push(s.language)

  if (hint) {
    // The engine decides the primary language. If the text clearly contradicts it
    // (e.g. Whisper says "ru" but the text is full of Tajik-only letters), prefer the text.
    const textPrimary = dominant(segments)
    const contradicts = textPrimary && textPrimary !== hint && isStrongSignal(text, textPrimary)
    return {
      language: contradicts ? textPrimary : hint,
      source: contradicts ? 'text-heuristic' : 'engine',
      engineProbability: contradicts ? undefined : engine?.probability,
      segments,
      languages: languages.length ? languages : [hint]
    }
  }
  return { language: dominant(segments), source: 'text-heuristic', segments, languages }
}

function dominant(segments: LanguageSegment[]): string | null {
  const weight = new Map<string, number>()
  for (const s of segments) if (s.language) weight.set(s.language, (weight.get(s.language) ?? 0) + s.text.length)
  let best: string | null = null
  let bestW = 0
  for (const [k, w] of weight) if (w > bestW) { best = k; bestW = w }
  return best
}

function isStrongSignal(text: string, lang: string): boolean {
  switch (lang) {
    case 'tg': return letterCount(text, TAJIK_ONLY) >= 2
    case 'tr': return letterCount(text, TURKISH_ONLY) >= 2
    case 'fa': return letterCount(text, PERSIAN_ONLY) >= 2
    case 'ru': return letterCount(text, RUSSIAN_ONLY) >= 3 && !TAJIK_ONLY.test(text)
    default: return false
  }
}

/**
 * For "multiple allowed languages" mode: pick which allowed language a first-pass result
 * should be forced to when the engine picked something outside the allowed set.
 */
export function chooseAllowedLanguage(text: string, detected: string | null, allowed: string[]): string | null {
  if (!allowed.length) return detected
  // Persian speech labelled "Tajik" (written in Persian script): it is Persian when the user speaks it.
  if (detected === 'tg' && allowed.includes('fa') && ARABIC_SCRIPT.test(text) && !CYRILLIC.test(text)) return 'fa'
  if (detected && allowed.includes(detected)) return detected
  // Whisper often labels Tajik speech as Persian (same language family, different script).
  // Cyrillic text without Russian-only letters + "fa" from the engine is almost always Tajik.
  if (detected === 'fa' && allowed.includes('tg') && CYRILLIC.test(text) && !RUSSIAN_ONLY.test(text)) return 'tg'
  const fromText = detectFragment(text, null)
  if (fromText && allowed.includes(fromText)) return fromText
  if ((detected === 'fa' || detected === 'ru') && allowed.includes('tg')) return 'tg'
  return allowed[0]
}
