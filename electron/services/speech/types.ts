import type { DictationErrorCode } from '../../../shared/types'

export interface TranscriptionRequest {
  wavPath: string
  wav: Buffer
  /** ISO code to force, or null for automatic detection. */
  language: string | null
  /** Vocabulary hint (personal dictionary). */
  prompt: string
  signal: AbortSignal
  durationMs: number
}

export interface TranscriptionResult {
  text: string
  /** Language reported by the engine (normalised ISO code), if any. */
  language: string | null
  /** Probability reported by the engine, ONLY if it actually returned one. */
  probability?: number
  provider: string
  model: string | null
}

export interface SpeechCapabilities {
  local: boolean
  languageDetection: boolean
  vocabularyPrompt: boolean
  forcedLanguage: boolean
  streaming: boolean
}

export interface SpeechProvider {
  readonly id: string
  readonly displayName: string
  initialize(): Promise<void>
  transcribe(req: TranscriptionRequest): Promise<TranscriptionResult>
  /** 'any' when the engine accepts every Whisper language code. */
  getSupportedLanguages(): string[] | 'any'
  getCapabilities(): SpeechCapabilities
  dispose(): Promise<void>
}

export class SpeechError extends Error {
  constructor(
    public readonly code: DictationErrorCode,
    message: string
  ) {
    super(message)
  }
}

/** Removes non-speech annotations Whisper emits for silence/noise. */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\[(BLANK_AUDIO|MUSIC|NOISE|SILENCE|INAUDIBLE|Music|Silence|Noise|music|silence|noise|Applause|Laughter)\]/g, ' ')
    .replace(/\((music|noise|silence|applause|laughter|музыка|шум|тишина)\)/giu, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

export interface WhisperJson {
  result?: { language?: string }
  params?: { language?: string }
  transcription?: { text: string }[]
}

export function parseWhisperJson(json: WhisperJson): { text: string; language: string | null } {
  const text = (json.transcription ?? []).map((s) => s.text).join('')
  const lang = json.result?.language ?? null
  return { text: cleanTranscript(text), language: lang && lang !== 'auto' ? lang : null }
}

/** Parses "auto-detected language: ru (p = 0.973218)" from whisper.cpp stderr. */
export function parseWhisperDetectedLanguage(stderr: string): { language: string; probability: number } | null {
  const m = /auto-detected language:\s*([a-z]{2,3})\s*\(p\s*=\s*([0-9.]+)\)/i.exec(stderr)
  if (!m) return null
  const p = Number(m[2])
  return { language: m[1].toLowerCase(), probability: Number.isFinite(p) ? p : NaN }
}
