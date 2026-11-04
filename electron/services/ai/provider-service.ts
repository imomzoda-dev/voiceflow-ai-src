/**
 * Owns provider connection records + their secrets, and builds provider clients on demand.
 * API keys are read from SecretsService only at call time and never returned to the renderer.
 */
import { randomUUID } from 'node:crypto'
import type { ProvidersRepository, ProviderRow } from '../../db/misc-repos'
import type { SecretsService } from '../secrets-service'
import type { ProviderInput, ProviderRecord, ProviderTestResult } from '../../../shared/types'
import { AnthropicChat, OpenAICompatibleChat, type TextAIProvider } from './text-providers'
import { OpenAICompatibleTranscriber } from '../speech/openai-transcriber'
import { isLocalUrl, validateProviderUrl } from './http'
import { UserFacingError } from '../../ipc/guard'
import { SpeechError } from '../speech/types'
import { createLogger } from '../../main/logger'

const log = createLogger('providers')

export class ProviderService {
  constructor(
    private readonly repo: ProvidersRepository,
    private readonly secrets: SecretsService
  ) {}

  private toRecord(r: ProviderRow): ProviderRecord {
    return {
      id: r.id,
      name: r.name,
      kind: r.kind as ProviderRecord['kind'],
      preset: r.preset,
      baseUrl: r.baseUrl,
      chatModel: r.chatModel,
      transcriptionModel: r.transcriptionModel,
      supportsTranscription: r.supportsTranscription,
      supportsChat: r.supportsChat,
      hasKey: this.secrets.has(r.id),
      isLocal: isLocalUrl(r.baseUrl),
      lastTestAt: r.lastTestAt,
      lastTestOk: r.lastTestOk,
      lastTestMessage: r.lastTestMessage,
      createdAt: r.createdAt
    }
  }

  async list(): Promise<ProviderRecord[]> {
    return (await this.repo.list()).map((r) => this.toRecord(r))
  }

  async get(id: string): Promise<ProviderRecord | null> {
    const r = await this.repo.get(id)
    return r ? this.toRecord(r) : null
  }

  async upsert(input: ProviderInput): Promise<ProviderRecord> {
    const v = validateProviderUrl(input.baseUrl)
    if (!v.ok) throw new UserFacingError(v.reason)
    if (input.apiKey && !this.secrets.available()) throw new UserFacingError('Secure storage (DPAPI/Keychain) is unavailable, so the API key cannot be saved safely.')
    const id = input.id ?? randomUUID()
    const existing = input.id ? await this.repo.get(input.id) : null
    const row: ProviderRow = {
      id,
      name: input.name.trim() || 'Provider',
      kind: input.kind,
      preset: input.preset,
      baseUrl: v.url,
      chatModel: input.chatModel?.trim() || null,
      transcriptionModel: input.transcriptionModel?.trim() || null,
      supportsTranscription: input.supportsTranscription,
      supportsChat: input.supportsChat,
      lastTestAt: existing?.lastTestAt ?? null,
      lastTestOk: existing?.lastTestOk ?? null,
      lastTestMessage: existing?.lastTestMessage ?? null,
      createdAt: existing?.createdAt ?? Date.now()
    }
    if (existing) await this.repo.update(id, row)
    else await this.repo.insert(row)
    if (input.apiKey !== undefined) {
      if (input.apiKey === '') this.secrets.delete(id)
      else this.secrets.set(id, input.apiKey.trim())
    }
    return this.toRecord(row)
  }

  async remove(id: string) {
    await this.repo.remove(id)
    this.secrets.delete(id)
  }

  async chatClient(id: string): Promise<{ client: TextAIProvider; record: ProviderRecord }> {
    const r = await this.repo.get(id)
    if (!r) throw new SpeechError('provider-missing', 'AI provider not found')
    const opts = { id: r.id, name: r.name, baseUrl: r.baseUrl, apiKey: this.secrets.get(r.id) }
    const client = r.kind === 'anthropic' ? new AnthropicChat(opts) : new OpenAICompatibleChat(opts)
    return { client, record: this.toRecord(r) }
  }

  async transcriber(id: string): Promise<OpenAICompatibleTranscriber> {
    const r = await this.repo.get(id)
    if (!r) throw new SpeechError('provider-missing', 'Speech provider not found')
    if (!r.supportsTranscription || !r.transcriptionModel) throw new SpeechError('provider-missing', `${r.name} has no transcription model configured`)
    return new OpenAICompatibleTranscriber({
      id: r.id,
      name: r.name,
      baseUrl: r.baseUrl,
      apiKey: this.secrets.get(r.id),
      model: r.transcriptionModel,
      isLocal: isLocalUrl(r.baseUrl)
    })
  }

  /** Connection test: lists models (cheap, no tokens consumed). */
  async test(id: string): Promise<ProviderTestResult> {
    const started = Date.now()
    let result: ProviderTestResult
    try {
      const { client, record } = await this.chatClient(id)
      if (!record.isLocal && !record.hasKey) throw new SpeechError('invalid-key', 'No API key saved')
      const models = await client.listModels()
      result = { ok: true, message: `Connected · ${models.length} models available`, models: models.slice(0, 500), latencyMs: Date.now() - started }
    } catch (e) {
      const msg = e instanceof SpeechError ? e.message : 'Connection failed'
      log.warn(`Provider test failed for ${id}`, { code: e instanceof SpeechError ? e.code : 'unknown' })
      result = { ok: false, message: msg, latencyMs: Date.now() - started }
    }
    await this.repo.update(id, { lastTestAt: Date.now(), lastTestOk: result.ok, lastTestMessage: result.message.slice(0, 300) })
    return result
  }
}
