import type {
  AppSettings,
  AssistantRequest,
  AssistantResponse,
  BackupInfo,
  DashboardStats,
  DictationRecord,
  DictationResult,
  DictationState,
  DictationTarget,
  DictionaryEntry,
  DocumentQuery,
  DocumentRecord,
  DocumentSummary,
  DocumentUpdate,
  DocumentVersion,
  DownloadProgress,
  ExportRequest,
  Folder,
  HistoryQuery,
  HotkeyStatus,
  ImportedDocument,
  PermissionKind,
  PermissionStatus,
  ProcessingMode,
  ProviderInput,
  ProviderRecord,
  ProviderTestResult,
  SettingsSection,
  SystemInfo,
  Template,
  UpdateState,
  VoiceCommandPayload,
  WhisperBinaryStatus,
  WhisperModelInfo
} from './types'

export type Unsubscribe = () => void

/** Everything the renderer can do. Implemented by the preload script, served by main-process IPC handlers. */
export interface VoiceFlowApi {
  settings: {
    get(): Promise<AppSettings>
    update<K extends SettingsSection>(section: K, patch: Partial<AppSettings[K]>): Promise<AppSettings>
    onChange(cb: (s: AppSettings) => void): Unsubscribe
  }
  documents: {
    list(q?: DocumentQuery): Promise<DocumentSummary[]>
    get(id: string): Promise<DocumentRecord | null>
    create(input: { title?: string; folderId?: string | null; templateId?: string | null; content?: unknown; contentText?: string }): Promise<DocumentRecord>
    update(id: string, patch: DocumentUpdate): Promise<{ updatedAt: number }>
    duplicate(id: string): Promise<DocumentRecord>
    move(id: string, folderId: string | null): Promise<void>
    setFavorite(id: string, favorite: boolean): Promise<void>
    trash(id: string): Promise<void>
    restore(id: string): Promise<void>
    deleteForever(id: string): Promise<void>
    emptyTrash(): Promise<number>
    markOpened(id: string): Promise<void>
    snapshot(id: string, reason: DocumentVersion['reason']): Promise<DocumentVersion | null>
    versions(id: string): Promise<DocumentVersion[]>
    versionContent(versionId: string): Promise<{ content: unknown; contentText: string } | null>
    restoreVersion(versionId: string): Promise<DocumentRecord | null>
  }
  folders: {
    list(): Promise<Folder[]>
    create(name: string, parentId?: string | null): Promise<Folder>
    rename(id: string, name: string): Promise<void>
    remove(id: string): Promise<void>
  }
  files: {
    exportDocument(req: ExportRequest): Promise<{ ok: boolean; path?: string; error?: string; cancelled?: boolean }>
    importDocument(): Promise<ImportedDocument | null>
    pickImage(): Promise<{ dataUrl: string; name: string } | null>
  }
  history: {
    list(q?: HistoryQuery): Promise<{ items: DictationRecord[]; total: number }>
    remove(id: string): Promise<void>
    clear(): Promise<number>
    export(format: 'json' | 'csv' | 'txt'): Promise<{ ok: boolean; path?: string; cancelled?: boolean }>
    deleteAudio(): Promise<number>
  }
  dictionary: {
    list(): Promise<DictionaryEntry[]>
    upsert(e: Omit<DictionaryEntry, 'id'> & { id?: string }): Promise<DictionaryEntry>
    remove(id: string): Promise<void>
  }
  templates: {
    list(): Promise<Template[]>
    create(t: { name: string; description: string; category: string; content: unknown }): Promise<Template>
    update(id: string, t: { name?: string; description?: string; category?: string; content?: unknown }): Promise<void>
    remove(id: string): Promise<void>
  }
  providers: {
    list(): Promise<ProviderRecord[]>
    upsert(p: ProviderInput): Promise<ProviderRecord>
    remove(id: string): Promise<void>
    test(id: string): Promise<ProviderTestResult>
  }
  models: {
    catalog(): Promise<WhisperModelInfo[]>
    download(id: string): Promise<{ ok: boolean; error?: string }>
    cancel(id: string): Promise<void>
    remove(id: string): Promise<void>
    onProgress(cb: (p: DownloadProgress) => void): Unsubscribe
    binaryStatus(): Promise<WhisperBinaryStatus>
    installBinary(variant?: 'cpu' | 'cuda'): Promise<{ ok: boolean; error?: string; path?: string }>
    engineInfo(): Promise<import('./types').EngineInfo>
    chooseBinary(): Promise<WhisperBinaryStatus>
    openFolder(): Promise<void>
  }
  dictation: {
    start(opts?: { target?: DictationTarget }): Promise<{ ok: boolean; error?: string }>
    stop(): Promise<void>
    cancel(): Promise<void>
    toggle(opts?: { target?: DictationTarget }): Promise<void>
    state(): Promise<DictationState>
    /** Choose a language in the picker (mouse click on the widget). */
    pick(index: number): Promise<void>
    pasteLast(): Promise<boolean>
    reprocess(id: string, mode: ProcessingMode): Promise<{ ok: boolean; text?: string; error?: string }>
    onState(cb: (s: DictationState) => void): Unsubscribe
    onResult(cb: (r: DictationResult) => void): Unsubscribe
    onLevel(cb: (level: number) => void): Unsubscribe
    /** Editor integration: main asks the focused editor to insert text or run a command. */
    onEditorInsert(cb: (p: { text: string; resultId: string }) => void): Unsubscribe
    onEditorCommand(cb: (p: { command: VoiceCommandPayload; resultId: string }) => void): Unsubscribe
    setEditorFocus(focused: boolean): void
  }
  ai: {
    assistant(req: AssistantRequest): Promise<AssistantResponse>
    correct(text: string, mode: ProcessingMode, language: string | null): Promise<AssistantResponse>
  }
  hotkeys: {
    status(): Promise<HotkeyStatus>
    /** Temporarily disables all global hotkeys (used while the user records a new binding). */
    suspend(suspended: boolean): Promise<void>
    checkBinding(b: import('./hotkeys').HotkeyBinding): Promise<{ ok: boolean; conflict: string | null }>
  }
  system: {
    info(): Promise<SystemInfo>
    permissions(): Promise<Record<PermissionKind, PermissionStatus>>
    requestPermission(kind: PermissionKind): Promise<PermissionStatus>
    openPermissionSettings(kind: PermissionKind): Promise<void>
    openLogs(): Promise<void>
    openExternal(url: string): Promise<boolean>
    showMainWindow(page?: string): Promise<void>
    clearAllData(): Promise<void>
    stats(): Promise<DashboardStats>
    onNavigate(cb: (page: string) => void): Unsubscribe
    onFlushRequest(cb: () => Promise<void> | void): Unsubscribe
  }
  updates: {
    get(): Promise<UpdateState>
    check(): Promise<UpdateState>
    download(): Promise<void>
    cancel(): Promise<void>
    install(): Promise<void>
    notes(version: string): Promise<{ name: string; body: string; url: string } | null>
    onState(cb: (s: UpdateState) => void): Unsubscribe
  }
  backup: {
    create(): Promise<{ ok: boolean; path?: string; error?: string; cancelled?: boolean }>
    restore(): Promise<{ ok: boolean; error?: string; cancelled?: boolean; counts?: Record<string, number> }>
    list(): Promise<BackupInfo[]>
    chooseDirectory(): Promise<string | null>
    exportSettings(): Promise<{ ok: boolean; path?: string; cancelled?: boolean }>
  }
  /** Used only by the overlay recorder window. */
  recorder: {
    onCommand(cb: (cmd: RecorderCommand) => void): Unsubscribe
    /** One audio segment: in live mode each phrase (after a pause) is sent as it ends; `final` marks the last one. */
    submit(sessionId: string, wav: ArrayBuffer, meta: { durationMs: number; peak: number; rms: number; index: number; final: boolean }): Promise<void>
    reportError(sessionId: string, code: 'mic-unavailable' | 'mic-permission' | 'no-audio', message: string): void
    reportLevel(level: number): void
    reportReady(sessionId: string): void
    cancelFromWidget(): void
  }
}

export type RecorderCommand =
  | { type: 'start'; sessionId: string; deviceId: string | null; gain: number; maxDurationSec: number; autoStopOnSilence: boolean; silenceTimeoutSec: number; live: boolean }
  | { type: 'stop'; sessionId: string }
  | { type: 'cancel'; sessionId: string }
  | { type: 'prewarm' }

declare global {
  interface Window {
    voiceflow: VoiceFlowApi
  }
}
