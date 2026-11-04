# Architecture

```
┌──────────────────────────── Main process (Node, trusted) ─────────────────────────────┐
│ main.ts ── lifecycle only                                                              │
│ app-context.ts ── composition root (creates every service once)                        │
│                                                                                        │
│  HotkeyManager ─ HotkeyMatcher ─ NativeInputBridge (uiohook-napi) ── OS keyboard hook  │
│        │ press/release                                                                 │
│        ▼                                                                               │
│  DictationService (state machine) ──► RecorderPort ──► overlay window (mic, WAV)       │
│        │ WAV ◄────────────────────────────────────────── recorder:submit              │
│        ├─► SpeechProvider: WhisperCppProvider | OpenAICompatibleTranscriber            │
│        ├─► language-detect + dictionary + voice-commands (shared/)                     │
│        ├─► TextProcessor ─► TextAIProvider: OpenAI-compatible | Anthropic              │
│        └─► OutputPort: editor (IPC event) | TypingService (clipboard + Ctrl/Cmd+V)     │
│                                                                                        │
│  SQLite (node:sqlite + Drizzle sqlite-proxy, migrations) ─ repositories                │
│  SecretsService (safeStorage: DPAPI/Keychain) · ProviderService · LocalSpeechService   │
│  FileService (docx, mammoth, marked, printToPDF) · BackupService · Tray · Updater      │
│  ipc/*.ipc.ts ── every handler: sender check + zod validation + sanitised errors       │
└────────────────────────────────────────────────────────────────────────────────────────┘
            ▲ contextBridge (preload/index.ts — explicit, minimal API, no Node)
┌───────────┴──────────── Renderer (sandboxed, CSP) ────────────┐   ┌── Overlay window ──┐
│ React 19 · Tailwind v4 · Radix · Motion · Zustand · i18next    │   │ MicRecorder:        │
│ pages/: dashboard, documents+editor (Tiptap), voice, history,  │   │ getUserMedia →      │
│ assistant, dictionary, templates, settings, onboarding         │   │ AudioWorklet →      │
│ features/document-management: autosave, recovery, flush        │   │ 16 kHz PCM16 WAV    │
└────────────────────────────────────────────────────────────────┘   │ + floating widget   │
                                                                     └─────────────────────┘
```

## Dictation sequence (hold mode)

1. Key down → `HotkeyMatcher` (repeats filtered) → `DictationService.start()`.
2. `preflight()`: engine/model/provider/privacy checks. It fails early, before anything is recorded.
3. The overlay is shown with `showInactive()`, so the target app keeps focus. Recorder `start` → `getUserMedia` → `reportReady` (a watchdog fires after 5 s).
4. Key up → `stop()`. The target (editor or external app) is decided at this moment. The recorder sends the WAV, with silence trimmed (a watchdog fires after 12 s).
5. Transcribe → language detection → voice-command check (editor only) → dictionary → AI correction (with safety guard and fallback) → dictionary again.
6. Insert → history row → SUCCESS → IDLE after 1.4 s. Errors → ERROR with a localised code → IDLE after 3.5 s.

## Folders

| Path | Contents |
|---|---|
| `electron/main` | lifecycle, windows, tray, hotkeys, permissions, updater, logger, paths |
| `electron/ipc` | IPC registration by domain + guard |
| `electron/services` | dictation, typing/clipboard, speech/*, ai/*, export/*, files, backup, settings, secrets |
| `electron/native` | `NativeInputBridge` + libuiohook implementation |
| `electron/db` | SQLite client, repositories, built-in templates |
| `database/` | Drizzle schema + generated SQL migrations (shipped as extraResources) |
| `shared/` | Pure, tested logic and types shared by both processes |
| `src/` | Renderer: `app/`, `pages/`, `components/`, `features/`, `services/audio`, `stores/`, `i18n/` |
| `tests/unit` | Vitest (node + jsdom) |
| `tests/e2e` | Playwright against the built Electron app |

## Database

The schema is in `database/schema.ts`:

| Table | Purpose |
|---|---|
| `profiles` | Local profile |
| `document_folders`, `documents` | Full Tiptap JSON plus plain text for search |
| `document_versions` | Throttled snapshots |
| `dictations` | The brief's `dictations` and `dictation_history` merged into one table: one row per dictation, with original, corrected and final text |
| `personal_dictionary` | Dictionary entries |
| `templates` | Built-in and user templates |
| `ai_providers` | Provider definitions, without keys |
| `speech_models` | Installed local models |
| `app_settings` | One JSON row per settings section, each validated with zod |
| `backup_history` | Record of backups |

Indexes cover update time, folder, trash and favourites for documents; start time and language for dictations; and versions by document and time.
