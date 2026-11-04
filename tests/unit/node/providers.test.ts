import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { OpenAICompatibleTranscriber } from '../../../electron/services/speech/openai-transcriber'
import { OpenAICompatibleChat, AnthropicChat } from '../../../electron/services/ai/text-providers'
import { buildCorrectionPrompt, cleanModelOutput, isCorrectionSafe, buildAssistantPrompt } from '../../../electron/services/ai/prompts'
import { normalizeRaw } from '../../../electron/services/ai/text-processor'
import { validateProviderUrl } from '../../../electron/services/ai/http'
import { parseWhisperDetectedLanguage, parseWhisperJson, cleanTranscript } from '../../../electron/services/speech/types'
import { downloadFile } from '../../../electron/services/speech/downloader'
import { redact } from '../../../electron/main/logger'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() } }))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('OpenAI-compatible transcription', () => {
  it('sends multipart audio with model/language/prompt and parses verbose_json language', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init!.body as FormData
      expect(form.get('model')).toBe('whisper-large-v3-turbo')
      expect(form.get('response_format')).toBe('verbose_json')
      expect(form.get('prompt')).toBe('VoiceFlow')
      expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer gsk_x')
      return json({ text: ' Салом дунё ', language: 'tajik' })
    })
    const t = new OpenAICompatibleTranscriber({ id: 'g', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1/', apiKey: 'gsk_x', model: 'whisper-large-v3-turbo', isLocal: false, fetchImpl: fetchImpl as unknown as typeof fetch })
    const r = await t.transcribe({ wavPath: 'x', wav: Buffer.from('RIFF'), language: null, prompt: 'VoiceFlow', signal: new AbortController().signal, durationMs: 1000 })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(r).toMatchObject({ text: 'Салом дунё', language: 'tg' })
  })
  it('maps 401 to invalid-key and network failures to network', async () => {
    const bad = new OpenAICompatibleTranscriber({ id: 'o', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'whisper-1', isLocal: false, fetchImpl: (async () => json({ error: { message: 'bad key' } }, 401)) as unknown as typeof fetch })
    await expect(bad.transcribe({ wavPath: 'x', wav: Buffer.alloc(4), language: 'ru', prompt: '', signal: new AbortController().signal, durationMs: 1 })).rejects.toMatchObject({ code: 'invalid-key' })
    const down = new OpenAICompatibleTranscriber({ id: 'o', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'whisper-1', isLocal: false, fetchImpl: (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch })
    await expect(down.transcribe({ wavPath: 'x', wav: Buffer.alloc(4), language: 'ru', prompt: '', signal: new AbortController().signal, durationMs: 1 })).rejects.toMatchObject({ code: 'network' })
  })
  it('does not request verbose_json for gpt-4o transcribe models (documented limitation)', () => {
    const t = new OpenAICompatibleTranscriber({ id: 'o', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o-transcribe', isLocal: false })
    expect(t.getCapabilities().languageDetection).toBe(false)
  })
})

describe('chat providers', () => {
  it('OpenAI-compatible chat returns message content', async () => {
    const f = vi.fn(async () => json({ choices: [{ message: { content: 'Салом.' } }] }))
    const c = new OpenAICompatibleChat({ id: 'x', name: 'Ollama', baseUrl: 'http://localhost:11434/v1', apiKey: null, fetchImpl: f as unknown as typeof fetch })
    expect(await c.complete({ model: 'm', messages: [{ role: 'user', content: 'салом' }] })).toBe('Салом.')
  })
  it('Anthropic chat sends system separately with the version header', async () => {
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body))
      expect(body.system).toBe('S')
      expect(body.messages).toEqual([{ role: 'user', content: 'U' }])
      expect((init!.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01')
      return json({ content: [{ type: 'text', text: 'ok' }] })
    })
    const c = new AnthropicChat({ id: 'a', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'k', fetchImpl: f as unknown as typeof fetch })
    expect(await c.complete({ model: 'claude-sonnet-5-5', messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }] })).toBe('ok')
  })
})

describe('correction prompts & safety', () => {
  it('Tajik correction prompt keeps the language and lists Tajik letters', () => {
    const p = buildCorrectionPrompt('correct', 'tg', [{ id: '1', original: '', preferred: 'Ёқубов', language: null, alias: null, category: 'surname' }])
    expect(p).toContain('Never translate')
    expect(p).toContain('ғ, ӣ, қ, ӯ, ҳ, ҷ')
    expect(p).toContain('Ёқубов')
    expect(p).not.toContain('Russian guidance')
  })
  it('translation prompt allows translating; others forbid it', () => {
    expect(buildAssistantPrompt({ action: 'translate', text: 'x', targetLanguage: 'tg' }, 'ru').system).toContain('Tajik (Cyrillic script)')
    expect(buildAssistantPrompt({ action: 'fix', text: 'x' }, 'ru').system).toContain('Never translate')
  })
  it('strips wrappers models add and rejects runaway rewrites', () => {
    expect(cleanModelOutput('Here is the corrected text:\n\n«Салом.»')).toBe('Салом.')
    expect(cleanModelOutput('```\nтекст\n```')).toBe('текст')
    const original = 'сегодня мы обсудили план работы на следующую неделю и распределили задачи'
    expect(isCorrectionSafe(original, 'Сегодня мы обсудили план работы на следующую неделю и распределили задачи.', 'correct')).toBe(true)
    expect(isCorrectionSafe(original, 'Конечно! Вот подробный план: ' + 'очень длинный ответ '.repeat(20), 'correct')).toBe(false)
  })
  it('RAW normalisation never changes words', () => {
    expect(normalizeRaw('  ҳаво  хуб аст , мо меравем ')).toBe('Ҳаво хуб аст, мо меравем')
  })
})

describe('whisper.cpp output parsing', () => {
  it('reads text + language from JSON and probability from stderr', () => {
    expect(parseWhisperJson({ result: { language: 'tg' }, transcription: [{ text: ' Салом' }, { text: ' дунё [BLANK_AUDIO]' }] })).toEqual({ text: 'Салом дунё', language: 'tg' })
    expect(parseWhisperDetectedLanguage('whisper_full: auto-detected language: ru (p = 0.973218)')).toEqual({ language: 'ru', probability: 0.973218 })
    expect(cleanTranscript('[Music] (музыка) ')).toBe('')
  })
})

describe('security helpers', () => {
  it('only allows https or loopback http endpoints', () => {
    expect(validateProviderUrl('https://api.openai.com/v1/').ok).toBe(true)
    expect(validateProviderUrl('http://localhost:11434/v1').ok).toBe(true)
    expect(validateProviderUrl('http://evil.example/v1').ok).toBe(false)
    expect(validateProviderUrl('https://user:pass@x.com').ok).toBe(false)
  })
  it('redacts API keys and auth headers from logs', () => {
    const out = redact('Authorization: Bearer sk-abcdef1234567890 and api_key=gsk_1234567890abcdef x-api-key: sk-ant-xyz12345678')
    expect(out).not.toMatch(/sk-abcdef|gsk_1234|sk-ant-xyz/)
  })
})

describe('model downloader', () => {
  const body = Buffer.from('ggml model bytes '.repeat(1000))
  const sha = createHash('sha256').update(body).digest('hex')
  const fetchOk = (async () => new Response(body, { status: 200, headers: { 'content-length': String(body.length) } })) as unknown as typeof fetch

  it('verifies SHA-256 and writes atomically', async () => {
    const dest = join(mkdtempSync(join(tmpdir(), 'vf-dl-')), 'm.bin')
    const progress: number[] = []
    const r = await downloadFile({ url: 'https://x/m.bin', dest, signal: new AbortController().signal, expectedSha256: sha, fetchImpl: fetchOk, onProgress: (n) => progress.push(n) })
    expect(r).toMatchObject({ sha256: sha, size: body.length, verified: true })
    expect(readFileSync(dest).equals(body)).toBe(true)
    expect(progress.at(-1)).toBe(body.length)
  })
  it('deletes the partial file on checksum mismatch', async () => {
    const dest = join(mkdtempSync(join(tmpdir(), 'vf-dl-')), 'm.bin')
    await expect(downloadFile({ url: 'https://x/m.bin', dest, signal: new AbortController().signal, expectedSha256: '0'.repeat(64), fetchImpl: fetchOk })).rejects.toThrow(/Checksum mismatch/)
    expect(existsSync(dest)).toBe(false)
    expect(existsSync(`${dest}.part`)).toBe(false)
  })
})
