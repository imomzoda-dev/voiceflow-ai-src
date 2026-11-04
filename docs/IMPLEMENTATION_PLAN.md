# VoiceFlow AI — Implementation Plan

> "Your Voice. Your Words. Your Intelligence."

Started 2026-11-04 in an empty folder. This plan records the decisions I made after checking the environment, the phases, and the real status of each feature. It is updated as work lands. Status legend: **Done** (built and checked here), **Done, needs target-OS check** (built, but only runs fully on a specific OS or with a key or model), **Partial**, **Planned**.

## 1. Environment analysis (Windows 11 dev machine)

| Tool | Found | Consequence |
|---|---|---|
| Node.js | 24.12 | OK |
| npm / pnpm | 11.8 / 10.34 | npm used (most predictable with electron-builder) |
| Electron | 45.2 (Node 24.22 inside) | Built-in `node:sqlite` is available, so no native SQLite build is needed |
| Rust / cargo | **not installed** | The Rust (napi-rs) helper can't be built here. See decision D2 |
| Visual Studio | 2022 + 18 | Could build node-gyp modules, but none need it |
| Python | 3.14 | Not needed at runtime |

## 2. Key technical decisions

**D1. Build tooling: electron-vite 6 + Vite 8 + electron-builder.** electron-vite gives one config for main, preload and renderer with HMR. electron-builder produces the NSIS (Windows x64) and DMG (macOS arm64/x64) installers.

**D2. Native integration: `uiohook-napi` behind a `NativeInputBridge` interface.**
Electron's `globalShortcut` only fires on press, so it can't drive push-to-talk. Options:
- Rust helper (napi-rs or a sidecar process): the preferred long-term choice, but there's no Rust toolchain here. Shipping unbuilt, untested Rust would break rule 12 ("no fake functions").
- `uiohook-napi` (libuiohook): N-API, so it's ABI-stable across Node and Electron. It ships prebuilt binaries for win32-x64/arm64 and darwin-x64/arm64. It gives real global **keydown/keyup** events (WH_KEYBOARD_LL on Windows, CGEventTap on macOS) and `keyTap` to send the paste shortcut.

Chosen: `uiohook-napi`, isolated in `electron/native/` behind `NativeInputBridge`, so a Rust helper can replace it later without touching the hotkey or typing logic. `native/` holds the Rust helper spec (see `native/README.md`).

**Privacy guarantee:** the hook callback only compares each event with the user's configured bindings. Nothing else is stored, logged or sent anywhere.

**Key suppression:** libuiohook can't swallow keys, so F12 would also reach Chrome and open DevTools. To stop that, the same accelerator is also registered with `globalShortcut` as a no-op. Windows `RegisterHotKey` and macOS Carbon hotkeys consume the keydown, while the low-level hook still sees down and up. If that registration fails, another app owns the shortcut; this is how conflicts are detected and shown to the user.

**D3. Database: SQLite via the built-in `node:sqlite` + Drizzle ORM (`sqlite-proxy` driver) + drizzle-kit SQL migrations.** This avoids native-ABI rebuilds (better-sqlite3 has to be compiled for each Electron version). The same driver runs in Vitest on Node 24, so the repository tests hit a real SQLite database. WAL mode is on.

**D4. Secrets: Electron `safeStorage`** (DPAPI on Windows, Keychain-protected key on macOS). Encrypted blobs go in `secrets.bin` in userData. Keys never enter SQLite, JSON settings, logs, backups or the renderer. The renderer only ever sees `hasKey: true/false`.

**D5. Speech providers** (main process, `SpeechProvider` interface):
- `whisper.cpp`: runs `whisper-cli` as a child process on a 16 kHz mono WAV and reads its JSON output, including the detected language. The app can download the official Windows build from the ggml-org/whisper.cpp GitHub release. On macOS the user points it at `whisper-cli` (for example from `brew install whisper-cpp`); common paths are auto-detected. Models are ggml files from `huggingface.co/ggerganov/whisper.cpp`, downloaded only after the user clicks, and checked against the SHA-256 that Hugging Face publishes in the `x-linked-etag` header.
- `OpenAI-compatible transcription`: one implementation for OpenAI (`whisper-1`), Groq (`whisper-large-v3-turbo`) and any compatible server. That includes **faster-whisper** through `speaches` / `faster-whisper-server`, which expose the same `/v1/audio/transcriptions` API. Faster-whisper is therefore supported as a local server, not as an embedded Python runtime.

**D6. Text AI providers** (`TextAIProvider` interface): OpenAI-compatible chat completions (OpenAI, Groq, OpenRouter, Ollama, LM Studio, llama.cpp server) and the Anthropic Messages API. Three separate roles: Speech, Correction, Assistant. All network calls run in the main process, with TLS verification left on.

**D7. Audio pipeline:** `getUserMedia` (echo cancellation off; Chromium noise suppression and auto-gain on, which help Whisper in noisy rooms) feeds an AudioWorklet. The worklet produces RMS levels for the waveform and Float32 chunks. Those are resampled to 16 kHz mono, encoded as PCM16 WAV, and sent to main over IPC as an ArrayBuffer. Capture runs in the overlay window, which is preloaded and hidden, so push-to-talk starts with no page-load delay. The mic stream is opened only while recording and released right after.

**D8. Text insertion into other apps:** save the clipboard (text/HTML/RTF/image), write the result, wait until the hotkey's modifiers are released, send Ctrl+V (Windows) or Cmd+V (macOS) with `keyTap`, then restore the clipboard. The overlay is shown with `showInactive()` and `focusable: false`, so the target app keeps focus. If the main window's editor is focused, the text goes straight into Tiptap over IPC.

**D9. Documents:** Tiptap v3 JSON is stored in full, along with plain text for search. Autosave is debounced (900 ms). Unsaved edits are mirrored to a crash-recovery journal. Version snapshots are throttled to at most one every 5 minutes, plus one on manual save; the last 50 per document are kept.

**D10. Import/export:**
- DOCX export: `docx`, with a custom Tiptap→DOCX converter.
- DOCX import: `mammoth` → HTML → DOMPurify → Tiptap.
- PDF: Chromium `printToPDF` on a hidden, sandboxed window with embedded fonts. Fonts are embedded and text stays selectable, so Ё Ғ Қ Ӯ Ҳ Ҷ Ӣ export correctly.
- Markdown: `turndown` (export) and `marked` (import), with sanitization.
- TXT.

**D11. Security:**
- `contextIsolation`, `sandbox: true`, `nodeIntegration: false` and `webSecurity` on.
- Strict CSP.
- Navigation and `window.open` blocked; external links go through an allowlist to `shell.openExternal`.
- Every IPC handler checks the sender frame URL and validates its payload with zod.
- No `eval`. AI output and imported documents are treated as untrusted text and HTML.

## 3. Phases

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | electron-vite scaffold, secure window, IPC contract, SQLite + migrations, i18n (en/ru/tg), design tokens | ✅ |
| 2 Main UI | Sidebar, Dashboard, Documents, History, Dictionary, Templates, Settings, themes | ✅ |
| 3 Editor | Tiptap, toolbar, autosave, recovery, versions, import/export | ✅ |
| 4 Audio | Mic capture, worklet, WAV, waveform, device test | ✅ (pipeline unit-tested; live mic check pending) |
| 5 Speech | whisper.cpp runner, model manager, cloud STT, language detection | 🟡 built; real-model run pending |
| 6 Hotkeys | uiohook bridge, hold/toggle/manual, conflict detection, permissions | ✅ Windows · 🟡 macOS |
| 7 Text intelligence | RAW/CORRECT/PROFESSIONAL prompts, providers, dictionary post-processing | 🟡 built; quality needs an API key |
| 8 AI Assistant | Selection actions, preview-before-apply, voice commands | 🟡 built; needs a provider |
| 9 Polish | Animations, reduced motion, empty/loading/error states | ✅ |
| 10 Production | Tests, electron-builder configs, docs | ✅ Windows · ⬜ macOS build on a Mac |

## 4. Feature status

Kept current in `docs/FEATURE_STATUS.md`.
