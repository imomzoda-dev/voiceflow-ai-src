import type { AppSettings, ProcessingMode, SettingsSection } from './settings'
import type { DictionaryEntry } from './dictionary'
import type { EditorCommand, AiCommand } from './voice-commands'
import type { HotkeyAction, HotkeyBinding } from './hotkeys'
import type { LanguageSegment, DetectionSource } from './language-detect'

export type { DictionaryEntry, AppSettings, ProcessingMode, SettingsSection, HotkeyBinding, HotkeyAction }

/* ---------------------------------- Documents ---------------------------------- */

export interface DocumentSummary {
  id: string
  title: string
  folderId: string | null
  excerpt: string
  wordCount: number
  isFavorite: boolean
  deletedAt: number | null
  createdAt: number
  updatedAt: number
  lastOpenedAt: number | null
}

export interface DocumentRecord extends DocumentSummary {
  /** Tiptap/ProseMirror JSON document. */
  content: unknown
  contentText: string
}

export interface DocumentQuery {
  search?: string
  folderId?: string | null
  scope?: 'all' | 'favorites' | 'trash' | 'recent'
  sort?: 'updated' | 'created' | 'title' | 'opened'
  limit?: number
}

export interface DocumentUpdate {
  title?: string
  content?: unknown
  contentText?: string
  wordCount?: number
}

export interface DocumentVersion {
  id: string
  documentId: string
  reason: 'auto' | 'manual' | 'restore' | 'import' | 'ai'
  wordCount: number
  excerpt: string
  createdAt: number
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  documentCount: number
}

export interface Template {
  id: string
  name: string
  description: string
  category: string
  content: unknown
  isBuiltin: boolean
  createdAt: number
}

/* ---------------------------------- Dictation ---------------------------------- */

export type DictationPhase = 'idle' | 'selecting' | 'recording' | 'processing' | 'correcting' | 'inserting' | 'success' | 'error'

export type DictationTarget = 'auto' | 'editor' | 'external' | 'preview'

export interface DictationState {
  phase: DictationPhase
  sessionId: string | null
  startedAt: number | null
  /** Language shown in the widget (engine/heuristic result). */
  language: string | null
  mode: ProcessingMode
  message: string | null
  /** Error code for localisation in the renderer. */
  errorCode: DictationErrorCode | null
  activation: 'hold' | 'toggle' | 'manual'
  maxDurationSec: number
  /** Language picker (phase "selecting"): the user's languages, the highlighted one and when it auto-confirms. */
  pickLanguages: string[]
  pickIndex: number
  pickDeadline: number | null
  pickSeconds: number
  /** Live typing: the end of the text inserted so far in this dictation. */
  liveText: string
  /** The final text was left on the clipboard. */
  copied: boolean
}

export type DictationErrorCode =
  | 'mic-unavailable'
  | 'mic-permission'
  | 'no-audio'
  | 'too-short'
  | 'model-missing'
  | 'binary-missing'
  | 'provider-missing'
  | 'cloud-not-allowed'
  | 'invalid-key'
  | 'network'
  | 'provider-error'
  | 'transcription-failed'
  | 'empty-transcript'
  | 'insert-failed'
  | 'timeout'
  | 'recorder-failed'
  | 'busy'
  | 'unknown'

export interface DictationResult {
  id: string
  original: string
  corrected: string | null
  final: string
  language: string | null
  languageSource: DetectionSource
  engineProbability?: number
  segments: LanguageSegment[]
  mode: ProcessingMode
  correctionStatus: 'skipped' | 'applied' | 'failed' | 'rejected-unsafe' | 'not-configured'
  durationMs: number
  target: Exclude<DictationTarget, 'auto'>
  command?: VoiceCommandPayload
}

export type VoiceCommandPayload = { kind: 'editor'; command: EditorCommand } | { kind: 'ai'; command: AiCommand }

export interface DictationRecord {
  id: string
  startedAt: number
  durationMs: number
  language: string | null
  speechProvider: string
  speechModel: string | null
  mode: ProcessingMode
  originalText: string
  correctedText: string | null
  finalText: string
  status: 'success' | 'error' | 'cancelled' | 'command'
  error: string | null
  target: string
  wordCount: number
  hasAudio: boolean
  documentId: string | null
}

export interface HistoryQuery {
  search?: string
  language?: string | null
  status?: DictationRecord['status'] | null
  from?: number | null
  to?: number | null
  limit?: number
  offset?: number
}

/* ---------------------------------- Providers ---------------------------------- */

export type ProviderKind = 'openai-compatible' | 'anthropic'

export interface ProviderRecord {
  id: string
  name: string
  kind: ProviderKind
  /** Preset this was created from (openai, groq, ollama, …) for icons/hints. */
  preset: string
  baseUrl: string
  chatModel: string | null
  transcriptionModel: string | null
  supportsTranscription: boolean
  supportsChat: boolean
  /** Whether a secret is stored. The key itself never leaves the main process. */
  hasKey: boolean
  isLocal: boolean
  lastTestAt: number | null
  lastTestOk: boolean | null
  lastTestMessage: string | null
  createdAt: number
}

export interface ProviderInput {
  id?: string
  name: string
  kind: ProviderKind
  preset: string
  baseUrl: string
  chatModel: string | null
  transcriptionModel: string | null
  supportsTranscription: boolean
  supportsChat: boolean
  /** undefined = keep existing, '' = remove, other = replace */
  apiKey?: string
}

export interface ProviderTestResult {
  ok: boolean
  message: string
  models?: string[]
  latencyMs?: number
}

/* ------------------------------- Whisper models ------------------------------- */

export interface WhisperModelInfo {
  id: string
  file: string
  label: string
  approxSizeMb: number
  multilingual: boolean
  speed: 1 | 2 | 3 | 4 | 5
  quality: 1 | 2 | 3 | 4 | 5
  recommended?: boolean
  installed: boolean
  verified: boolean | null
  sizeBytes: number | null
  path: string | null
}

export interface DownloadProgress {
  id: string
  receivedBytes: number
  totalBytes: number | null
  state: 'downloading' | 'verifying' | 'done' | 'error' | 'cancelled'
  message?: string
}

export interface WhisperBinaryStatus {
  found: boolean
  path: string | null
  source: 'custom' | 'bundled' | 'downloaded' | 'system' | null
  version: string | null
  canAutoInstall: boolean
  /** NVIDIA GPU found on this PC (name), when a CUDA build can be used. */
  nvidiaGpu: string | null
  /** Installed GPU (CUDA) build of whisper.cpp, used instead of the CPU build when "Use GPU" is on. */
  gpuPath: string | null
}

/** What the speech engine actually runs on, and how fast the last phrase was. */
export interface EngineInfo {
  backend: 'gpu' | 'cpu' | null
  device: string | null
  lastAudioMs: number | null
  lastMs: number | null
}

/* ---------------------------------- AI actions ---------------------------------- */

export type AssistantAction =
  | 'fix'
  | 'rewrite'
  | 'translate'
  | 'explain'
  | 'shorten'
  | 'expand'
  | 'tone'
  | 'continue'
  | 'summarize'
  | 'professional'

export interface AssistantRequest {
  action: AssistantAction
  text: string
  /** Short surrounding context (a few paragraphs), never the whole document by default. */
  context?: string
  targetLanguage?: string
  tone?: 'formal' | 'friendly' | 'neutral' | 'persuasive' | 'academic'
}

export interface AssistantResponse {
  ok: boolean
  text?: string
  error?: string
  errorCode?: DictationErrorCode
  providerName?: string
}

/* ------------------------------------ System ------------------------------------ */

export type PermissionKind = 'microphone' | 'accessibility' | 'input-monitoring'
export type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'not-required' | 'unknown'

export interface SystemInfo {
  platform: string
  arch: string
  version: string
  electron: string
  chrome: string
  node: string
  userData: string
  logsDir: string
  isPackaged: boolean
}

export interface HotkeyStatus {
  nativeHookRunning: boolean
  nativeError: string | null
  registrations: { action: HotkeyAction; binding: HotkeyBinding | null; suppressed: boolean; conflict: string | null }[]
}

export interface DashboardStats {
  totalWords: number
  totalDictations: number
  totalDurationMs: number
  wordsToday: number
  wordsThisWeek: number
  documentsCount: number
  languages: { language: string; count: number }[]
  daily: { day: string; words: number }[]
}

export interface BackupInfo {
  id: string
  createdAt: number
  path: string
  sizeBytes: number
  kind: 'manual' | 'scheduled'
  status: 'ok' | 'error'
  message: string | null
}

export interface ImportedDocument {
  title: string
  html: string
  format: 'docx' | 'md' | 'txt' | 'html'
  warnings: string[]
}

export type ExportFormat = 'docx' | 'pdf' | 'md' | 'txt' | 'html'

export interface ExportRequest {
  format: ExportFormat
  title: string
  content: unknown
  html: string
  markdown?: string
  text?: string
}

export type UpdatePhase = 'unsupported' | 'idle' | 'checking' | 'not-available' | 'available' | 'downloading' | 'verifying' | 'downloaded' | 'installing' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  currentVersion: string
  version?: string
  releaseName?: string
  releaseNotes?: string
  releaseDate?: string
  releaseUrl?: string
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  checkedAt?: number
  error?: string
}

export interface SettingsChange<K extends SettingsSection = SettingsSection> {
  section: K
  value: AppSettings[K]
}
