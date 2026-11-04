/**
 * Language catalog: every language Whisper can recognise (99 + Cantonese). Codes are ISO 639-1 as used by Whisper. The list is not a hard limit:
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
  { code: 'tk', english: 'Turkmen', native: 'Türkmençe' },
  { code: 'az', english: 'Azerbaijani', native: 'Azərbaycanca' },
  { code: 'ps', english: 'Pashto', native: 'پښتو', rtl: true },
  { code: 'ur', english: 'Urdu', native: 'اردو', rtl: true },
  { code: 'hi', english: 'Hindi', native: 'हिन्दी' },
  { code: 'uk', english: 'Ukrainian', native: 'Українська' },
  { code: 'be', english: 'Belarusian', native: 'Беларуская' },
  { code: 'de', english: 'German', native: 'Deutsch' },
  { code: 'fr', english: 'French', native: 'Français' },
  { code: 'es', english: 'Spanish', native: 'Español' },
  { code: 'it', english: 'Italian', native: 'Italiano' },
  { code: 'pt', english: 'Portuguese', native: 'Português' },
  { code: 'zh', english: 'Chinese', native: '中文' },
  { code: 'yue', english: 'Cantonese', native: '粵語' },
  { code: 'ja', english: 'Japanese', native: '日本語' },
  { code: 'ko', english: 'Korean', native: '한국어' },
  { code: 'pl', english: 'Polish', native: 'Polski' },
  { code: 'nl', english: 'Dutch', native: 'Nederlands' },
  { code: 'sv', english: 'Swedish', native: 'Svenska' },
  { code: 'no', english: 'Norwegian', native: 'Norsk' },
  { code: 'nn', english: 'Nynorsk', native: 'Nynorsk' },
  { code: 'da', english: 'Danish', native: 'Dansk' },
  { code: 'fi', english: 'Finnish', native: 'Suomi' },
  { code: 'is', english: 'Icelandic', native: 'Íslenska' },
  { code: 'fo', english: 'Faroese', native: 'Føroyskt' },
  { code: 'cs', english: 'Czech', native: 'Čeština' },
  { code: 'sk', english: 'Slovak', native: 'Slovenčina' },
  { code: 'sl', english: 'Slovenian', native: 'Slovenščina' },
  { code: 'hr', english: 'Croatian', native: 'Hrvatski' },
  { code: 'sr', english: 'Serbian', native: 'Српски' },
  { code: 'bs', english: 'Bosnian', native: 'Bosanski' },
  { code: 'mk', english: 'Macedonian', native: 'Македонски' },
  { code: 'bg', english: 'Bulgarian', native: 'Български' },
  { code: 'ro', english: 'Romanian', native: 'Română' },
  { code: 'hu', english: 'Hungarian', native: 'Magyar' },
  { code: 'el', english: 'Greek', native: 'Ελληνικά' },
  { code: 'sq', english: 'Albanian', native: 'Shqip' },
  { code: 'lt', english: 'Lithuanian', native: 'Lietuvių' },
  { code: 'lv', english: 'Latvian', native: 'Latviešu' },
  { code: 'et', english: 'Estonian', native: 'Eesti' },
  { code: 'ka', english: 'Georgian', native: 'ქართული' },
  { code: 'hy', english: 'Armenian', native: 'Հայերեն' },
  { code: 'he', english: 'Hebrew', native: 'עברית', rtl: true },
  { code: 'yi', english: 'Yiddish', native: 'ייִדיש', rtl: true },
  { code: 'mn', english: 'Mongolian', native: 'Монгол' },
  { code: 'tt', english: 'Tatar', native: 'Татарча' },
  { code: 'ba', english: 'Bashkir', native: 'Башҡортса' },
  { code: 'bn', english: 'Bengali', native: 'বাংলা' },
  { code: 'pa', english: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'gu', english: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'mr', english: 'Marathi', native: 'मराठी' },
  { code: 'ne', english: 'Nepali', native: 'नेपाली' },
  { code: 'si', english: 'Sinhala', native: 'සිංහල' },
  { code: 'ta', english: 'Tamil', native: 'தமிழ்' },
  { code: 'te', english: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', english: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', english: 'Malayalam', native: 'മലയാളം' },
  { code: 'as', english: 'Assamese', native: 'অসমীয়া' },
  { code: 'sd', english: 'Sindhi', native: 'سنڌي', rtl: true },
  { code: 'sa', english: 'Sanskrit', native: 'संस्कृतम्' },
  { code: 'th', english: 'Thai', native: 'ไทย' },
  { code: 'lo', english: 'Lao', native: 'ລາວ' },
  { code: 'km', english: 'Khmer', native: 'ខ្មែរ' },
  { code: 'my', english: 'Burmese', native: 'မြန်မာ' },
  { code: 'vi', english: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'id', english: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'ms', english: 'Malay', native: 'Bahasa Melayu' },
  { code: 'jw', english: 'Javanese', native: 'Basa Jawa' },
  { code: 'su', english: 'Sundanese', native: 'Basa Sunda' },
  { code: 'tl', english: 'Tagalog', native: 'Tagalog' },
  { code: 'bo', english: 'Tibetan', native: 'བོད་སྐད་' },
  { code: 'sw', english: 'Swahili', native: 'Kiswahili' },
  { code: 'am', english: 'Amharic', native: 'አማርኛ' },
  { code: 'so', english: 'Somali', native: 'Soomaali' },
  { code: 'ha', english: 'Hausa', native: 'Hausa' },
  { code: 'yo', english: 'Yoruba', native: 'Yorùbá' },
  { code: 'sn', english: 'Shona', native: 'chiShona' },
  { code: 'ln', english: 'Lingala', native: 'Lingála' },
  { code: 'af', english: 'Afrikaans', native: 'Afrikaans' },
  { code: 'mg', english: 'Malagasy', native: 'Malagasy' },
  { code: 'ca', english: 'Catalan', native: 'Català' },
  { code: 'eu', english: 'Basque', native: 'Euskara' },
  { code: 'gl', english: 'Galician', native: 'Galego' },
  { code: 'oc', english: 'Occitan', native: 'Occitan' },
  { code: 'br', english: 'Breton', native: 'Brezhoneg' },
  { code: 'cy', english: 'Welsh', native: 'Cymraeg' },
  { code: 'lb', english: 'Luxembourgish', native: 'Lëtzebuergesch' },
  { code: 'mt', english: 'Maltese', native: 'Malti' },
  { code: 'la', english: 'Latin', native: 'Latina' },
  { code: 'ht', english: 'Haitian Creole', native: 'Kreyòl ayisyen' },
  { code: 'mi', english: 'Maori', native: 'Te Reo Māori' },
  { code: 'haw', english: 'Hawaiian', native: 'ʻŌlelo Hawaiʻi' }
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
