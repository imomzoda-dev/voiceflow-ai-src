/**
 * OpenAI-compatible `/audio/transcriptions` provider. Works with:
 *  - OpenAI (whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe)
 *  - Groq (whisper-large-v3, whisper-large-v3-turbo)
 *  - Local faster-whisper servers exposing the same API (speaches, faster-whisper-server)
 *
 * Limitation (not hidden): `gpt-4o-*-transcribe` models don't support `verbose_json`, so no
 * detected language is returned for them; we then rely on the text heuristic.
 */
import { SpeechError, cleanTranscript, type SpeechProvider, type TranscriptionRequest, type TranscriptionResult } from './types'
import { normalizeLanguageCode } from '../../../shared/languages'
import { httpErrorToCode, joinUrl } from '../ai/http'

export interface OpenAITranscriberOptions {
  id: string
  name: string
  baseUrl: string
  apiKey: string | null
  model: string
  isLocal: boolean
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class OpenAICompatibleTranscriber implements SpeechProvider {
  readonly id: string
  readonly displayName: string

  constructor(private readonly o: OpenAITranscriberOptions) {
    this.id = o.id
    this.displayName = o.name
  }

  async initialize() {
    if (!this.o.model) throw new SpeechError('provider-missing', 'No transcription model configured')
    if (!this.o.isLocal && !this.o.apiKey) throw new SpeechError('invalid-key', 'API key is missing')
  }

  private supportsVerbose(): boolean {
    return !/gpt-4o.*transcribe/i.test(this.o.model)
  }

  async transcribe(req: TranscriptionRequest): Promise<TranscriptionResult> {
    await this.initialize()
    const f = this.o.fetchImpl ?? fetch
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(req.wav)], { type: 'audio/wav' }), 'speech.wav')
    form.append('model', this.o.model)
    form.append('response_format', this.supportsVerbose() ? 'verbose_json' : 'json')
    if (req.language) form.append('language', req.language)
    if (req.prompt) form.append('prompt', req.prompt)
    form.append('temperature', '0')

    const timeout = AbortSignal.timeout(this.o.timeoutMs ?? 120_000)
    const signal = AbortSignal.any([req.signal, timeout])
    let res: Response
    try {
      res = await f(joinUrl(this.o.baseUrl, '/audio/transcriptions'), {
        method: 'POST',
        headers: this.o.apiKey ? { Authorization: `Bearer ${this.o.apiKey}` } : {},
        body: form,
        signal
      })
    } catch (e) {
      if (timeout.aborted) throw new SpeechError('timeout', 'The speech service did not respond in time')
      if (req.signal.aborted) throw new SpeechError('unknown', 'cancelled')
      throw new SpeechError('network', `Could not reach ${this.o.name}: ${(e as Error).message}`)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new SpeechError(httpErrorToCode(res.status), `${this.o.name} returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
    }
    const data = (await res.json()) as { text?: string; language?: string }
    return {
      text: cleanTranscript(data.text ?? ''),
      language: normalizeLanguageCode(data.language ?? req.language),
      provider: this.id,
      model: this.o.model
    }
  }

  getSupportedLanguages(): 'any' {
    return 'any'
  }

  getCapabilities() {
    return { local: this.o.isLocal, languageDetection: this.supportsVerbose(), vocabularyPrompt: true, forcedLanguage: true, streaming: false }
  }

  async dispose() {}
}
