/**
 * AI Text Processor: RAW (local normalisation only), CORRECT and PROFESSIONAL (LLM).
 * Always keeps the original transcript; falls back to it when AI is unavailable or unsafe.
 */
import type { ProviderService } from './provider-service'
import type { AppSettings } from '../../../shared/settings'
import type { AssistantRequest, AssistantResponse, DictationResult, ProcessingMode } from '../../../shared/types'
import type { DictionaryEntry } from '../../../shared/dictionary'
import { buildAssistantPrompt, buildCorrectionPrompt, cleanModelOutput, isCorrectionSafe } from './prompts'
import { SpeechError } from '../speech/types'
import { createLogger } from '../../main/logger'

const log = createLogger('text-ai')

/** Minimal, meaning-preserving normalisation used for RAW mode and as the AI fallback. */
export function normalizeRaw(text: string): string {
  let s = text.replace(/[ \t ]+/g, ' ').replace(/ +([,.;:!?…])/g, '$1').trim()
  if (!s) return s
  // Capitalise the first letter (Unicode-aware) without touching the rest.
  s = s.replace(/^(\P{L}*)(\p{Ll})/u, (_m, pre: string, ch: string) => pre + ch.toLocaleUpperCase())
  return s
}

export interface ProcessOutcome {
  final: string
  corrected: string | null
  status: DictationResult['correctionStatus']
  error?: string
  errorCode?: SpeechError['code']
}

export class TextProcessor {
  constructor(
    private readonly providers: ProviderService,
    private readonly getSettings: () => AppSettings
  ) {}

  private async resolve(role: 'correction' | 'assistant') {
    const s = this.getSettings()
    const id = role === 'correction' ? s.writing.correctionProviderId : s.writing.assistantProviderId ?? s.writing.correctionProviderId
    const modelOverride = role === 'correction' ? s.writing.correctionModel : s.writing.assistantModel ?? s.writing.correctionModel
    if (!id) throw new SpeechError('provider-missing', 'No AI provider selected')
    const { client, record } = await this.providers.chatClient(id)
    if (!record.isLocal && !s.privacy.allowCloud) throw new SpeechError('cloud-not-allowed', 'Cloud processing is disabled in Privacy settings')
    const model = modelOverride || record.chatModel
    if (!model) throw new SpeechError('provider-missing', `No model selected for ${record.name}`)
    return { client, record, model }
  }

  async process(text: string, mode: ProcessingMode, language: string | null, dictionary: DictionaryEntry[], signal?: AbortSignal): Promise<ProcessOutcome> {
    const raw = normalizeRaw(text)
    if (mode === 'raw' || !raw) return { final: raw, corrected: null, status: 'skipped' }
    const s = this.getSettings()
    try {
      const { client, model } = await this.resolve('correction')
      const system = buildCorrectionPrompt(mode, language, dictionary, s.writing.customInstructions[mode])
      const out = cleanModelOutput(
        await client.complete({
          model,
          temperature: mode === 'professional' ? 0.3 : 0.1,
          maxTokens: Math.min(8192, Math.ceil(raw.length / 2) + 512),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: raw }
          ],
          signal
        })
      )
      if (!isCorrectionSafe(raw, out, mode)) {
        log.warn('Correction rejected by safety check', { mode, inLen: raw.length, outLen: out.length })
        return { final: raw, corrected: out, status: 'rejected-unsafe' }
      }
      return { final: out, corrected: out, status: 'applied' }
    } catch (e) {
      const err = e instanceof SpeechError ? e : new SpeechError('provider-error', (e as Error).message)
      if (err.code === 'provider-missing') return { final: raw, corrected: null, status: 'not-configured', error: err.message, errorCode: err.code }
      log.warn('Correction failed', { code: err.code })
      return { final: raw, corrected: null, status: 'failed', error: err.message, errorCode: err.code }
    }
  }

  async assistant(req: AssistantRequest, docLanguage: string | null): Promise<AssistantResponse> {
    try {
      const { client, record, model } = await this.resolve('assistant')
      const { system, user, temperature } = buildAssistantPrompt(req, docLanguage)
      const out = await client.complete({
        model,
        temperature,
        maxTokens: Math.min(8192, Math.ceil(req.text.length / 1.5) + 1024),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
      return { ok: true, text: cleanModelOutput(out), providerName: record.name }
    } catch (e) {
      const err = e instanceof SpeechError ? e : new SpeechError('provider-error', (e as Error).message)
      return { ok: false, error: err.message, errorCode: err.code }
    }
  }
}
