/**
 * Language catalog. Codes are ISO 639-1 as used by Whisper. The list is not a hard limit:
 * any code reported by an engine is displayed, falling back to the raw code.
 */
export interface LanguageInfo {
  code: string
  /** English name (also the name OpenAI's verbose_json returns, lower-cased). */
  english: string
  /** Endonym shown in the UI. */
  native: string
  rtl?: boolean
  /** Languages we pay extra attention to in prompts, detection and tests. */
  featured?: boolean
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'tg', english: 'Tajik', native: 'Тоҷикӣ', featured: true },
  { code: 'ru', english: 'Russian', native: 'Русский', featured: true },
  { code: 'en', english: 'English', native: 'English', featured: true },
  { code: 'uz', english: 'Uzbek', native: 'Oʻzbekcha', featured: true },
  { code: 'tr', english: 'Turkish', native: 'Türkçe', featured: true },
  { code: 'ar', english: 'Arabic', native: 'العربية', rtl: true, featured: true },
  { code: 'fa', english: 'Persian', native: 'فارسی', rtl: true },
  { code: 'kk', english: 'Kazakh', native: 'Қазақша' },
  { code: 'ky', english: 'Kyrgyz', native: 'Кыргызча' },
  { code: 'uk', english: 'Ukrainian', native: 'Українська' },
  { code: 'be', english: 'Belarusian', native: 'Беларуская' },
  { code: 'az', english: 'Azerbaijani', native: 'Azərbaycanca' },
  { code: 'de', english: 'German', native: 'Deutsch' },
  { code: 'fr', english: 'French', native: 'Français' },
  { code: 'es', english: 'Spanish', native: 'Español' },
  { code: 'it', english: 'Italian', native: 'Italiano' },
  { code: 'pt', english: 'Portuguese', native: 'Português' },
  { code: 'pl', english: 'Polish', native: 'Polski' },
  { code: 'nl', english: 'Dutch', native: 'Nederlands' },
  { code: 'zh', english: 'Chinese', native: '中文' },
  { code: 'ja', english: 'Japanese', native: '日本語' },
  { code: 'ko', english: 'Korean', native: '한국어' },
  { code: 'hi', english: 'Hindi', native: 'हिन्दी' },
  { code: 'ur', english: 'Urdu', native: 'اردو', rtl: true },
  { code: 'he', english: 'Hebrew', native: 'עברית', rtl: true }
]

const byCode = new Map(LANGUAGES.map((l) => [l.code, l]))
const byEnglish = new Map(LANGUAGES.map((l) => [l.english.toLowerCase(), l]))

export function getLanguage(code: string | null | undefined): LanguageInfo | undefined {
  if (!code) return undefined
  return byCode.get(code.toLowerCase())
}

export function languageLabel(code: string | null | undefined): string {
  if (!code) return '—'
  return getLanguage(code)?.native ?? code
}

/**
 * Normalizes whatever an engine returns ("ru", "russian", "Russian", "tg") to an ISO code.
 * Returns null for unknown/empty values rather than guessing.
 */
export function normalizeLanguageCode(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  if (!v || v === 'auto' || v === 'unknown') return null
  if (byCode.has(v)) return v
  const fromName = byEnglish.get(v)
  if (fromName) return fromName.code
  if (/^[a-z]{2,3}$/.test(v)) return v
  return null
}
