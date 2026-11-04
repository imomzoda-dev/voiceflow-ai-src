/**
 * Writing systems. Whisper sometimes answers in the wrong alphabet for a language it has seen
 * little of — Tajik comes out in Latin letters ("Nomi man …") or Persian script, Urdu in Hindi
 * script, Mandarin in traditional characters. This module knows the expected script of every
 * supported language, measures how much of a transcript is written in it, provides a short
 * priming sentence in the right script (Whisper's `prompt` strongly steers spelling and script),
 * and cleans up text: Unicode NFC, Latin look-alike letters inside Cyrillic words, Arabic
 * letter forms in Persian.
 */

type Script =
  | 'Latin' | 'Cyrillic' | 'Arabic' | 'Hebrew' | 'Greek' | 'Georgian' | 'Armenian' | 'Devanagari'
  | 'Bengali' | 'Gurmukhi' | 'Gujarati' | 'Tamil' | 'Telugu' | 'Kannada' | 'Malayalam' | 'Sinhala'
  | 'Thai' | 'Lao' | 'Khmer' | 'Myanmar' | 'Tibetan' | 'Ethiopic' | 'Hangul' | 'Han' | 'Japanese'

const BY_SCRIPT: Record<Exclude<Script, 'Latin'>, string[]> = {
  Cyrillic: ['ru', 'uk', 'be', 'bg', 'mk', 'kk', 'ky', 'tg', 'mn', 'tt', 'ba'],
  Arabic: ['ar', 'fa', 'ur', 'ps', 'sd'],
  Hebrew: ['he', 'yi'],
  Greek: ['el'],
  Georgian: ['ka'],
  Armenian: ['hy'],
  Devanagari: ['hi', 'mr', 'ne', 'sa'],
  Bengali: ['bn', 'as'],
  Gurmukhi: ['pa'],
  Gujarati: ['gu'],
  Tamil: ['ta'],
  Telugu: ['te'],
  Kannada: ['kn'],
  Malayalam: ['ml'],
  Sinhala: ['si'],
  Thai: ['th'],
  Lao: ['lo'],
  Khmer: ['km'],
  Myanmar: ['my'],
  Tibetan: ['bo'],
  Ethiopic: ['am'],
  Hangul: ['ko'],
  Han: ['zh', 'yue'],
  Japanese: ['ja']
}

const SCRIPT_OF = new Map<string, Script>()
for (const [script, langs] of Object.entries(BY_SCRIPT)) for (const l of langs) SCRIPT_OF.set(l, script as Script)

/** Serbian is officially written in both alphabets. */
const ALSO_ACCEPTED: Record<string, Script[]> = { sr: ['Cyrillic', 'Latin'] }

/** Expected script of a language (Latin for everything not listed). */
export function expectedScript(lang: string): Script {
  return SCRIPT_OF.get(lang) ?? 'Latin'
}

const LETTER = /\p{L}/u
const SCRIPT_RE: Record<Script, RegExp> = {
  Latin: /\p{Script=Latin}/u,
  Cyrillic: /\p{Script=Cyrillic}/u,
  Arabic: /\p{Script=Arabic}/u,
  Hebrew: /\p{Script=Hebrew}/u,
  Greek: /\p{Script=Greek}/u,
  Georgian: /\p{Script=Georgian}/u,
  Armenian: /\p{Script=Armenian}/u,
  Devanagari: /\p{Script=Devanagari}/u,
  Bengali: /\p{Script=Bengali}/u,
  Gurmukhi: /\p{Script=Gurmukhi}/u,
  Gujarati: /\p{Script=Gujarati}/u,
  Tamil: /\p{Script=Tamil}/u,
  Telugu: /\p{Script=Telugu}/u,
  Kannada: /\p{Script=Kannada}/u,
  Malayalam: /\p{Script=Malayalam}/u,
  Sinhala: /\p{Script=Sinhala}/u,
  Thai: /\p{Script=Thai}/u,
  Lao: /\p{Script=Lao}/u,
  Khmer: /\p{Script=Khmer}/u,
  Myanmar: /\p{Script=Myanmar}/u,
  Tibetan: /\p{Script=Tibetan}/u,
  Ethiopic: /\p{Script=Ethiopic}/u,
  Hangul: /\p{Script=Hangul}/u,
  Han: /\p{Script=Han}/u,
  Japanese: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u
}

/**
 * Share (0..1) of the letters written in the language's script; 1 when there are no letters.
 * Short Latin words (names, brands like "iPhone") inside other scripts are normal, hence a ratio.
 */
export function scriptShare(text: string, lang: string): number {
  const accepted = ALSO_ACCEPTED[lang] ?? [expectedScript(lang)]
  let letters = 0
  let ok = 0
  for (const ch of text) {
    if (!LETTER.test(ch)) continue
    letters++
    if (accepted.some((s) => SCRIPT_RE[s].test(ch))) ok++
  }
  return letters ? ok / letters : 1
}

/** True when the transcript is (mostly) not in the language's script and should be redone. */
export function wrongScript(text: string, lang: string | null | undefined): boolean {
  if (!lang) return false
  const letters = [...text].filter((c) => LETTER.test(c)).length
  return letters >= 4 && scriptShare(text, lang) < 0.6
}

/**
 * A short, neutral sentence in the language's standard spelling, given to Whisper as the
 * preceding context. It sets the script, spelling conventions and punctuation. Only for
 * languages where Whisper is known to drift (script, variant, or missing punctuation).
 */
export const PRIMING: Record<string, string> = {
  tg: 'Салом, дӯстон! Имрӯз ҳаво хуб аст. Мо бо забони тоҷикӣ гап мезанем ва ҳар рӯз ба кор меравем.',
  fa: 'سلام دوستان! امروز هوا خوب است. ما به زبان فارسی صحبت می‌کنیم و هر روز به کار می‌رویم.',
  uz: 'Salom, doʻstlar! Bugun havo yaxshi. Biz oʻzbek tilida gaplashamiz.',
  kk: 'Сәлем, достар! Бүгін ауа райы жақсы. Біз қазақ тілінде сөйлейміз.',
  ky: 'Салам, досторум! Бүгүн аба ырайы жакшы. Биз кыргыз тилинде сүйлөйбүз.',
  az: 'Salam, dostlar! Bu gün hava yaxşıdır. Biz Azərbaycan dilində danışırıq.',
  tk: 'Salam, dostlar! Şu gün howa gowy. Biz türkmen dilinde gürleşýäris.',
  mn: 'Сайн байна уу! Өнөөдөр цаг агаар сайхан байна.',
  tt: 'Сәлам, дуслар! Бүген һава яхшы.',
  be: 'Добры дзень! Сёння добрае надвор’е.',
  uk: 'Привіт! Сьогодні гарна погода, і ми говоримо українською.',
  ur: 'السلام علیکم! آج موسم اچھا ہے۔ ہم اردو میں بات کر رہے ہیں۔',
  ps: 'سلام ملګرو! نن هوا ښه ده. موږ په پښتو خبرې کوو.',
  pa: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਅੱਜ ਮੌਸਮ ਵਧੀਆ ਹੈ।',
  hi: 'नमस्ते! आज मौसम अच्छा है।',
  ar: 'مرحبا! الطقس جميل اليوم.',
  he: 'שלום! היום מזג האוויר יפה.',
  zh: '以下是普通话的句子，使用简体中文。',
  yue: '以下係廣東話嘅句子。',
  ja: 'こんにちは。今日はいい天気ですね。',
  ko: '안녕하세요. 오늘은 날씨가 좋네요.'
}

/** Languages whose priming sentence is always sent (Whisper drifts often without it). */
const ALWAYS_PRIME = new Set(['tg', 'fa', 'uz', 'kk', 'ky', 'tk', 'tt', 'ur', 'ps', 'pa', 'zh', 'yue', 'mn'])

/** The prompt for a request: priming sentence (when useful or `force`) followed by vocabulary. */
export function buildPrompt(lang: string | null | undefined, vocabulary: string, force = false): string {
  const prime = lang && (force || ALWAYS_PRIME.has(lang)) ? PRIMING[lang] : undefined
  return [prime, vocabulary].filter(Boolean).join(' ')
}

/**
 * Whisper can "hear" its prompt in silence or noise and return it. Such a result is not speech.
 */
export function isPromptEcho(text: string, lang: string | null | undefined): boolean {
  const prime = lang ? PRIMING[lang] : undefined
  if (!prime) return false
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const t = norm(text)
  return t.length > 0 && norm(prime).includes(t)
}

// Latin letters that look identical to Cyrillic ones (and that Whisper mixes into Cyrillic words).
const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', i: 'і',
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У'
}
const CYR = /\p{Script=Cyrillic}/u
const LAT = /\p{Script=Latin}/u

/** Inside a word that is mostly Cyrillic, replaces Latin look-alikes with the Cyrillic letters. */
function fixMixedCyrillicWords(text: string, lang: string): string {
  return text.replace(/[\p{L}\p{M}]+/gu, (w) => {
    let cyr = 0
    let lat = 0
    for (const ch of w) {
      if (CYR.test(ch)) cyr++
      else if (LAT.test(ch)) lat++
    }
    if (!cyr || !lat || lat > cyr) return w
    return [...w]
      .map((ch) => {
        const c = LATIN_TO_CYRILLIC[ch]
        // "і" exists only in Ukrainian/Belarusian/Kazakh alphabets.
        if (c === 'і' && !['uk', 'be', 'kk'].includes(lang)) return 'и'
        return c ?? ch
      })
      .join('')
  })
}

/** Persian: Arabic forms of yeh and kaf → Persian letters; ZWNJ in the verb prefix "می‌". */
function normalizePersian(text: string): string {
  return text
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/(^|[\s(«])(ن?می) (?=[؀-ۿ])/gu, '$1$2‌')
}

/** Clean-up applied to every transcript in the language it was recognised in. */
export function normalizeTranscript(text: string, lang: string | null | undefined): string {
  let t = text.normalize('NFC')
  if (!lang) return t
  if (expectedScript(lang) === 'Cyrillic') t = fixMixedCyrillicWords(t, lang)
  if (lang === 'fa') t = normalizePersian(t)
  return t
}

const TERMINAL = /[.!?…。！？؟।۔:;»"')\]]$/u

/**
 * For models that write lower case without punctuation (e.g. the fine-tuned Tajik model):
 * capitalise the phrase and end it with a full stop, so live-typed phrases read as sentences.
 */
export function sentenceCase(text: string, lang: string | null | undefined): string {
  const cased = capitalizeStart(text, lang)
  return !cased || TERMINAL.test(cased) ? cased : cased + fullStop(lang)
}

/** True when the text already ends a sentence. */
export function endsSentence(text: string): boolean {
  return TERMINAL.test(text.trim())
}

/** The sentence-final mark of a language. */
export function fullStop(lang: string | null | undefined): string {
  return lang === 'ur' ? '۔' : lang === 'hi' ? '।' : '.'
}

/** Capitalises the first letter (for a phrase that starts a sentence). */
export function capitalizeStart(text: string, lang: string | null | undefined): string {
  const t = text.trim()
  return t ? t.charAt(0).toLocaleUpperCase(lang ?? undefined) + t.slice(1) : t
}

/**
 * Whisper's greedy decoding can fall into a loop and write a stretch of the phrase twice
 * ("…جوان باشد، باز همین دم یک دایناسر جوان باشد"). True when any run of `n` words occurs twice.
 */
export function hasRepeatedPhrase(text: string, n = 4): boolean {
  const words = text.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const seen = new Set<string>()
  for (let i = 0; i + n <= words.length; i++) {
    const key = words.slice(i, i + n).join(' ')
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}
