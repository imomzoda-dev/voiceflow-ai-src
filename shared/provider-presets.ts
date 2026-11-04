import type { ProviderKind } from './types'

export interface ProviderPreset {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  needsKey: boolean
  isLocal: boolean
  supportsChat: boolean
  supportsTranscription: boolean
  /** Suggestions only; the user picks the real model (or loads the list from the API). */
  suggestedChatModels: string[]
  suggestedTranscriptionModels: string[]
  docsUrl: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    isLocal: false,
    supportsChat: true,
    supportsTranscription: true,
    suggestedChatModels: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
    suggestedTranscriptionModels: ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'],
    docsUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'groq',
    name: 'Groq',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    isLocal: false,
    supportsChat: true,
    supportsTranscription: true,
    suggestedChatModels: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'],
    suggestedTranscriptionModels: ['whisper-large-v3-turbo', 'whisper-large-v3'],
    docsUrl: 'https://console.groq.com/keys'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    needsKey: true,
    isLocal: false,
    supportsChat: true,
    supportsTranscription: false,
    suggestedChatModels: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
    suggestedTranscriptionModels: [],
    docsUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    isLocal: false,
    supportsChat: true,
    supportsTranscription: false,
    suggestedChatModels: [],
    suggestedTranscriptionModels: [],
    docsUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    isLocal: true,
    supportsChat: true,
    supportsTranscription: false,
    suggestedChatModels: ['qwen3:8b', 'gemma3:12b', 'llama3.1:8b'],
    suggestedTranscriptionModels: [],
    docsUrl: 'https://ollama.com/download'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    isLocal: true,
    supportsChat: true,
    supportsTranscription: false,
    suggestedChatModels: [],
    suggestedTranscriptionModels: [],
    docsUrl: 'https://lmstudio.ai'
  },
  {
    id: 'faster-whisper',
    name: 'faster-whisper server (local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:8000/v1',
    needsKey: false,
    isLocal: true,
    supportsChat: false,
    supportsTranscription: true,
    suggestedChatModels: [],
    suggestedTranscriptionModels: ['Systran/faster-whisper-large-v3', 'deepdml/faster-whisper-large-v3-turbo-ct2', 'Systran/faster-whisper-small'],
    docsUrl: 'https://github.com/speaches-ai/speaches'
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    kind: 'openai-compatible',
    baseUrl: 'https://',
    needsKey: true,
    isLocal: false,
    supportsChat: true,
    supportsTranscription: false,
    suggestedChatModels: [],
    suggestedTranscriptionModels: [],
    docsUrl: ''
  }
]

export function presetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}
