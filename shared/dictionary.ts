/**
 * Personal dictionary post-processing. This does NOT change the speech model itself:
 * it (1) builds a prompt for engines that accept vocabulary hints, and (2) rewrites
 * recognised aliases/misspellings to the user's preferred spelling after recognition.
 */

export interface DictionaryEntry {
  id: string
  original: string
  preferred: string
  language: string | null
  alias: string | null
  category: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every spelling that should map to `preferred`. Aliases are separated by `,` or `;`. */
export function variantsOf(entry: DictionaryEntry): string[] {
  const out = new Set<string>()
  const add = (v: string | null | undefined) => {
    const t = v?.trim()
    if (t && t.toLocaleLowerCase() !== entry.preferred.trim().toLocaleLowerCase()) out.add(t)
  }
  add(entry.original)
  for (const a of (entry.alias ?? '').split(/[,;]/)) add(a)
  return [...out].sort((a, b) => b.length - a.length)
}

export interface DictionaryApplication {
  text: string
  replacements: { from: string; to: string }[]
}

/**
 * Replaces whole-word, case-insensitive matches (Unicode-aware, so Cyrillic and Tajik
 * letters count as word characters). Entries scoped to a language only apply when the
 * text's language matches.
 */
export function applyDictionary(text: string, entries: DictionaryEntry[], language: string | null): DictionaryApplication {
  let result = text
  const replacements: { from: string; to: string }[] = []
  const applicable = entries.filter((e) => !e.language || !language || e.language === language)
  for (const entry of applicable) {
    const preferred = entry.preferred.trim()
    if (!preferred) continue
    for (const variant of variantsOf(entry)) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(variant)}(?![\\p{L}\\p{N}_])`, 'giu')
      result = result.replace(re, (match) => {
        replacements.push({ from: match, to: preferred })
        return preferred
      })
    }
  }
  return { text: result, replacements }
}

/**
 * Vocabulary hint for Whisper-style `prompt` parameters. Whisper only looks at the last
 * ~224 tokens of the prompt, so we cap the length and keep the most specific terms first.
 */
export function buildVocabularyPrompt(entries: DictionaryEntry[], language: string | null, maxChars = 600): string {
  const words: string[] = []
  for (const e of entries) {
    if (e.language && language && e.language !== language) continue
    const w = e.preferred.trim()
    if (w && !words.includes(w)) words.push(w)
  }
  let out = ''
  for (const w of words) {
    const next = out ? `${out}, ${w}` : w
    if (next.length > maxChars) break
    out = next
  }
  return out
}
