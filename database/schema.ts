import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * VoiceFlow AI local database. Timestamps are Unix epoch milliseconds.
 * Secrets (API keys) are NEVER stored here — see electron/services/secrets-service.ts.
 */

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull()
})

export const documentFolders = sqliteTable(
  'document_folders',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('idx_folders_parent').on(t.parentId)]
)

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    folderId: text('folder_id').references(() => documentFolders.id, { onDelete: 'set null' }),
    /** Full Tiptap/ProseMirror JSON (structure, marks, tables, images). */
    contentJson: text('content_json').notNull(),
    /** Plain text for search, excerpts and statistics. */
    contentText: text('content_text').notNull().default(''),
    wordCount: integer('word_count').notNull().default(0),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    templateId: text('template_id'),
    deletedAt: integer('deleted_at'),
    lastSnapshotAt: integer('last_snapshot_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    lastOpenedAt: integer('last_opened_at')
  },
  (t) => [
    index('idx_documents_updated').on(t.updatedAt),
    index('idx_documents_folder').on(t.folderId),
    index('idx_documents_deleted').on(t.deletedAt),
    index('idx_documents_favorite').on(t.isFavorite)
  ]
)

export const documentVersions = sqliteTable(
  'document_versions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    contentJson: text('content_json').notNull(),
    contentText: text('content_text').notNull(),
    wordCount: integer('word_count').notNull(),
    reason: text('reason').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('idx_versions_doc_created').on(t.documentId, t.createdAt)]
)

export const dictations = sqliteTable(
  'dictations',
  {
    id: text('id').primaryKey(),
    startedAt: integer('started_at').notNull(),
    durationMs: integer('duration_ms').notNull(),
    language: text('language'),
    languageSource: text('language_source'),
    speechProvider: text('speech_provider').notNull(),
    speechModel: text('speech_model'),
    mode: text('mode').notNull(),
    originalText: text('original_text').notNull().default(''),
    correctedText: text('corrected_text'),
    finalText: text('final_text').notNull().default(''),
    status: text('status').notNull(),
    error: text('error'),
    target: text('target').notNull(),
    wordCount: integer('word_count').notNull().default(0),
    audioPath: text('audio_path'),
    documentId: text('document_id')
  },
  (t) => [index('idx_dictations_started').on(t.startedAt), index('idx_dictations_language').on(t.language)]
)

export const personalDictionary = sqliteTable(
  'personal_dictionary',
  {
    id: text('id').primaryKey(),
    original: text('original').notNull(),
    preferred: text('preferred').notNull(),
    language: text('language'),
    alias: text('alias'),
    category: text('category').notNull().default('term'),
    createdAt: integer('created_at').notNull()
  },
  (t) => [index('idx_dictionary_language').on(t.language)]
)

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default('general'),
  contentJson: text('content_json').notNull(),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull()
})

/** AI / speech API connections. The API key lives in the OS-protected secret store. */
export const aiProviders = sqliteTable('ai_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  preset: text('preset').notNull(),
  baseUrl: text('base_url').notNull(),
  chatModel: text('chat_model'),
  transcriptionModel: text('transcription_model'),
  supportsTranscription: integer('supports_transcription', { mode: 'boolean' }).notNull().default(false),
  supportsChat: integer('supports_chat', { mode: 'boolean' }).notNull().default(true),
  lastTestAt: integer('last_test_at'),
  lastTestOk: integer('last_test_ok', { mode: 'boolean' }),
  lastTestMessage: text('last_test_message'),
  createdAt: integer('created_at').notNull()
})

/** Locally installed speech models (whisper.cpp ggml files). */
export const speechModels = sqliteTable(
  'speech_models',
  {
    id: text('id').primaryKey(),
    engine: text('engine').notNull(),
    fileName: text('file_name').notNull(),
    path: text('path').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256'),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    installedAt: integer('installed_at').notNull()
  },
  (t) => [uniqueIndex('uq_speech_models_file').on(t.engine, t.fileName)]
)

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const backupHistory = sqliteTable('backup_history', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  path: text('path').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  message: text('message')
})
