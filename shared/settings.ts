import { z } from 'zod'
import { DEFAULT_CANCEL_BINDING, DEFAULT_DICTATE_BINDING } from './hotkeys'

export const hotkeyBindingSchema = z.object({
  keycode: z.number().int().nonnegative().max(0xffff),
  ctrl: z.boolean(),
  shift: z.boolean(),
  alt: z.boolean(),
  meta: z.boolean()
})

export const processingModeSchema = z.enum(['raw', 'correct', 'professional'])
export type ProcessingMode = z.infer<typeof processingModeSchema>

export const uiLanguageSchema = z.enum(['en', 'ru', 'tg'])
export type UiLanguage = z.infer<typeof uiLanguageSchema>

const langCode = z.string().regex(/^[a-z]{2,3}$/)

export const generalSchema = z.object({
  uiLanguage: uiLanguageSchema,
  launchAtLogin: z.boolean(),
  startMinimized: z.boolean(),
  closeBehavior: z.enum(['tray', 'quit']),
  notifications: z.boolean(),
  onboardingCompleted: z.boolean()
})

export const appearanceSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  accent: z.enum(['blue', 'violet', 'pink', 'orange', 'green', 'graphite']),
  compact: z.boolean(),
  motion: z.enum(['system', 'full', 'reduced'])
})

export const voiceSchema = z.object({
  microphoneId: z.string().max(512).nullable(),
  inputGain: z.number().min(0.25).max(4),
  activationMode: z.enum(['hold', 'toggle', 'manual']),
  hotkeys: z.object({
    dictate: hotkeyBindingSchema,
    cancel: hotkeyBindingSchema.nullable(),
    openWindow: hotkeyBindingSchema.nullable(),
    pasteLast: hotkeyBindingSchema.nullable(),
    cycleMode: hotkeyBindingSchema.nullable()
  }),
  /** Block the dictation key from reaching other apps (e.g. F12 opening DevTools in Chrome). */
  suppressHotkey: z.boolean(),
  maxDurationSec: z.number().int().min(5).max(900),
  autoStopOnSilence: z.boolean(),
  silenceTimeoutSec: z.number().min(1).max(30),
  voiceCommands: z.boolean(),
  /** Hold mode: releases shorter than this are treated as accidental taps and cancelled. */
  minHoldMs: z.number().int().min(0).max(2000),
  playSounds: z.boolean(),
  /** Where the floating dictation widget appears. */
  widgetPosition: z.enum(['top', 'bottom']),
  restoreClipboard: z.boolean()
})

export const recognitionSchema = z.object({
  /** 'whisper-cpp' or the id of a configured cloud/server provider. */
  speechProviderId: z.string().min(1).max(128),
  whisperModel: z.string().max(128),
  whisperBinaryPath: z.string().max(2048).nullable(),
  languageMode: z.enum(['auto', 'single', 'multiple']),
  language: langCode,
  allowedLanguages: z.array(langCode).max(20),
  quality: z.enum(['fast', 'balanced', 'accurate']),
  threads: z.number().int().min(0).max(64),
  useGpu: z.boolean()
})

export const writingSchema = z.object({
  mode: processingModeSchema,
  correctionProviderId: z.string().max(128).nullable(),
  correctionModel: z.string().max(256).nullable(),
  assistantProviderId: z.string().max(128).nullable(),
  assistantModel: z.string().max(256).nullable(),
  customInstructions: z.object({
    raw: z.string().max(4000),
    correct: z.string().max(4000),
    professional: z.string().max(4000)
  }),
  /** Insert raw text when the correction provider fails instead of failing the dictation. */
  fallbackToRaw: z.boolean(),
  keepOriginal: z.boolean()
})

export const storageSchema = z.object({
  historyRetentionDays: z.number().int().min(0).max(3650),
  saveAudio: z.boolean(),
  audioRetentionDays: z.number().int().min(1).max(365)
})

export const privacySchema = z.object({
  allowCloud: z.boolean()
})

export const backupSchema = z.object({
  schedule: z.enum(['off', 'daily', 'weekly']),
  directory: z.string().max(2048).nullable(),
  keep: z.number().int().min(1).max(100),
  lastBackupAt: z.number().nullable()
})

export const updatesSchema = z.object({
  /** Check GitHub Releases at start and every 4 hours. Downloads always need a click. */
  autoCheck: z.boolean()
})

export const settingsSchema = z.object({
  general: generalSchema,
  appearance: appearanceSchema,
  voice: voiceSchema,
  recognition: recognitionSchema,
  writing: writingSchema,
  storage: storageSchema,
  privacy: privacySchema,
  backup: backupSchema,
  updates: updatesSchema
})

export type AppSettings = z.infer<typeof settingsSchema>
export type SettingsSection = keyof AppSettings

export const sectionSchemas = {
  general: generalSchema,
  appearance: appearanceSchema,
  voice: voiceSchema,
  recognition: recognitionSchema,
  writing: writingSchema,
  storage: storageSchema,
  privacy: privacySchema,
  backup: backupSchema,
  updates: updatesSchema
} as const satisfies Record<SettingsSection, z.ZodTypeAny>

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    uiLanguage: 'en',
    launchAtLogin: false,
    startMinimized: false,
    closeBehavior: 'tray',
    notifications: true,
    onboardingCompleted: false
  },
  appearance: { theme: 'system', accent: 'blue', compact: false, motion: 'system' },
  voice: {
    microphoneId: null,
    inputGain: 1,
    activationMode: 'hold',
    hotkeys: { dictate: DEFAULT_DICTATE_BINDING, cancel: DEFAULT_CANCEL_BINDING, openWindow: null, pasteLast: null, cycleMode: null },
    suppressHotkey: true,
    maxDurationSec: 120,
    autoStopOnSilence: false,
    silenceTimeoutSec: 4,
    voiceCommands: true,
    minHoldMs: 250,
    playSounds: true,
    widgetPosition: 'top',
    restoreClipboard: true
  },
  recognition: {
    speechProviderId: 'whisper-cpp',
    whisperModel: 'large-v3-turbo-q5_0',
    whisperBinaryPath: null,
    languageMode: 'auto',
    language: 'tg',
    allowedLanguages: ['tg', 'ru', 'en'],
    quality: 'balanced',
    threads: 0,
    useGpu: true
  },
  writing: {
    mode: 'correct',
    correctionProviderId: null,
    correctionModel: null,
    assistantProviderId: null,
    assistantModel: null,
    customInstructions: { raw: '', correct: '', professional: '' },
    fallbackToRaw: true,
    keepOriginal: true
  },
  storage: { historyRetentionDays: 0, saveAudio: false, audioRetentionDays: 7 },
  privacy: { allowCloud: false },
  backup: { schedule: 'off', directory: null, keep: 10, lastBackupAt: null },
  updates: { autoCheck: true }
}

/**
 * Merges stored (possibly older/partial) settings over defaults section by section,
 * dropping any section that fails validation so a corrupt value never bricks the app.
 */
export function mergeSettings(stored: unknown): AppSettings {
  const out = structuredClone(DEFAULT_SETTINGS) as Record<SettingsSection, unknown>
  if (!stored || typeof stored !== 'object') return out as AppSettings
  for (const key of Object.keys(sectionSchemas) as SettingsSection[]) {
    const raw = (stored as Record<string, unknown>)[key]
    if (!raw || typeof raw !== 'object') continue
    const candidate = { ...(out[key] as object), ...(raw as object) }
    const parsed = sectionSchemas[key].safeParse(candidate)
    if (parsed.success) out[key] = parsed.data
  }
  return out as AppSettings
}
