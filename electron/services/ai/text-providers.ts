/**
 * Text-generation providers used for correction and the document assistant.
 * Responses are treated as untrusted plain text: never executed, never rendered as HTML.
 */
import { SpeechError } from '../speech/types'
import { httpErrorToCode, joinUrl } from './http'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  model: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface TextAIProvider {
  readonly id: string
  readonly name: string
  complete(req: ChatRequest): Promise<string>
  listModels(signal?: AbortSignal): Promise<string[]>
}

interface BaseOpts {
  id: string
  name: string
  baseUrl: string
  apiKey: string | null
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

async function request(o: BaseOpts, path: string, init: RequestInit & { signal?: AbortSignal }, headers: Record<string, string>): Promise<Response> {
  const f = o.fetchImpl ?? fetch
  const timeout = AbortSignal.timeout(o.timeoutMs ?? 90_000)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  let res: Response
  try {
    res = await f(joinUrl(o.baseUrl, path), { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, signal })
  } catch (e) {
    if (timeout.aborted) throw new SpeechError('timeout', `${o.name} did not respond in time`)
    if (init.signal?.aborted) throw new SpeechError('unknown', 'cancelled')
    throw new SpeechError('network', `Could not reach ${o.name}: ${(e as Error).message}`)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let detail = body.slice(0, 300)
    try {
      const j = JSON.parse(body) as { error?: { message?: string } | string }
      detail = typeof j.error === 'string' ? j.error : (j.error?.message ?? detail)
    } catch {
      /* not JSON */
    }
    throw new SpeechError(httpErrorToCode(res.status), `${o.name}: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`)
  }
  return res
}

export class OpenAICompatibleChat implements TextAIProvider {
  readonly id: string
  readonly name: string
  constructor(private readonly o: BaseOpts) {
    this.id = o.id
    this.name = o.name
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.o.apiKey) h.Authorization = `Bearer ${this.o.apiKey}`
    return h
  }

  async complete(req: ChatRequest): Promise<string> {
    const body: Record<string, unknown> = { model: req.model, messages: req.messages, temperature: req.temperature ?? 0.2, stream: false }
    if (req.maxTokens) body.max_tokens = req.maxTokens
    const res = await request(this.o, '/chat/completions', { method: 'POST', body: JSON.stringify(body), signal: req.signal }, this.headers())
    const data = (await res.json()) as { choices?: { message?: { content?: string | { type: string; text?: string }[] } }[] }
    const content = data.choices?.[0]?.message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) return content.map((c) => c.text ?? '').join('')
    throw new SpeechError('provider-error', `${this.name} returned an empty response`)
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const res = await request(this.o, '/models', { method: 'GET', signal }, this.headers())
    const data = (await res.json()) as { data?: { id: string }[]; models?: { name?: string; id?: string }[] }
    const list = data.data?.map((m) => m.id) ?? data.models?.map((m) => m.id ?? m.name ?? '') ?? []
    return list.filter(Boolean).sort()
  }
}

export class AnthropicChat implements TextAIProvider {
  readonly id: string
  readonly name: string
  constructor(private readonly o: BaseOpts) {
    this.id = o.id
    this.name = o.name
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', ...(this.o.apiKey ? { 'x-api-key': this.o.apiKey } : {}) }
  }

  async complete(req: ChatRequest): Promise<string> {
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const messages = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
    const body = { model: req.model, max_tokens: req.maxTokens ?? 4096, temperature: req.temperature ?? 0.2, system, messages }
    const res = await request(this.o, '/v1/messages', { method: 'POST', body: JSON.stringify(body), signal: req.signal }, this.headers())
    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
    if (!text) throw new SpeechError('provider-error', `${this.name} returned an empty response`)
    return text
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const res = await request(this.o, '/v1/models', { method: 'GET', signal }, this.headers())
    const data = (await res.json()) as { data?: { id: string }[] }
    return (data.data ?? []).map((m) => m.id).sort()
  }
}
