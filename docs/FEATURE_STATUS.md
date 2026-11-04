# Feature status — VoiceFlow AI 1.0.2

Checked on **Windows 11 x64** (Electron 45.2, Node 24) on 2026-11-04. **Nothing has been run on macOS yet.**

Legend:
- ✅ **Works**: implemented and verified here by automated tests and/or the running app.
- 🟡 **Built, needs a check**: implemented, but needs a model download, an API key, real speech, or the target OS before it can be called verified.
- ⬜ **Not done**: with the reason.

## Test results

| Suite | Result |
|---|---|
| `npm run typecheck` (main + renderer, strict) | ✅ 0 errors |
| `npm test` (Vitest, 7 files) | ✅ **67/67** |
| `npm run test:e2e` (Playwright driving the real Electron app, 4 files) | ✅ **10/10**: 8 standard + 2 real-speech tests (opt-in via `VOICEFLOW_SPEECH_DIR`) |
| `npm run build` | ✅ |
| `npm run dist:win` (NSIS) | ✅ `release/0.1.0/VoiceFlow-AI-Setup-0.1.0-x64.exe` (≈ 121 MB, **unsigned**) |

What the E2E tests cover (numbers refer to the brief's required test list):
- **1** App start + onboarding → dashboard
- **10/11/12** Create a document, apply an H1, add a table, type Tajik text, autosave → restart the app → content and structure are still there
- **18** The renderer has no Node access; malformed IPC payloads are rejected; invalid settings are rejected; API keys never come back to the renderer; plain-http remote endpoints are refused
- **2/5** Starting a dictation without a model fails before recording with a clear error, then returns to idle
- **19** The native keyboard hook runs on Windows; the main and recorder windows exist; F12 is bound
- **14/15** DOCX and PDF export: the PDF text layer contains all of Ё Ғ Қ Ӯ Ҳ Ҷ Ӣ (upper and lower case)
- UI renders in Russian and Tajik; every settings section opens
- **6/8 Real speech** (`tests/e2e/speech.spec.ts`):
  - Setup: whisper.cpp `b5454` and `ggml-base.bin` were installed through the app's own download code, both with SHA-256 verified. Windows TTS clips were played into the app through Chromium's fake microphone, so the full path ran: getUserMedia → AudioWorklet → WAV → whisper.cpp → language detection.
  - 🇷🇺 detected `ru`: «Сегодня мы обсудили план работы на следующую неделю и распределили *задачей* между сотрудниками.» One wrong word, from the small Base model.
  - 🇬🇧 detected `en`: «Hello! This is a test of the voice typing application. Please insert this sentence into the document.» Exact.
  - About 11 s per dictation, of which ≈ 8 s is the recording itself.
  - **Tajik could not be tested with synthetic speech**: Windows has no Tajik TTS voice, so a real recording is needed.

What the unit tests cover:
- **3/4/9** Push-to-talk matcher: auto-repeat, combos, Right Alt, suspend, stuck-key reset
- Dictation state machine: full pipeline, editor vs. external target, double-press guard, cancel with late audio ignored, short-tap rejection, toggle, max duration, silence detection, missing model, API error codes, AI-failure fallback, voice commands, re-run with a forced allowed language
- **8** Language detection: Tajik, Russian, English, Turkish, Uzbek, Arabic, mixed ru/en/tg, Whisper ru→tg and fa→tg confusions
- **16** Dictionary
- **17** History and statistics on real SQLite
- Documents repository: versions, trash, folders, search escaping
- Settings validation and persistence
- Backup round trip
- Encrypted secrets
- DOCX round trip through mammoth
- WAV / resampling / silence trimming
- OpenAI, Groq and Anthropic request formats with mocked HTTP
- Prompt safety guard; log redaction
- Model download SHA-256 verification and cleanup
- Editor: dictation insertion, voice commands, HTML sanitising, Markdown export

## Global voice typing

| Feature | Status |
|---|---|
| Global keydown/keyup hook (libuiohook) | ✅ Windows (hook runs in E2E) · 🟡 macOS (needs Accessibility + Input Monitoring) |
| Hold / Toggle / Manual modes, auto-repeat filtering, short-tap rejection, max duration, Esc cancel | ✅ (unit tests) |
| Hotkey editor: F1–F24, Home/End/…, Right Alt/Ctrl/Shift, modifier combos; conflict detection (system-reserved, unsafe bare keys, duplicates, in use by another app) | ✅ Built · 🟡 "in use" detection relies on `globalShortcut.register` failing |
| Blocking the hotkey in other apps (e.g. F12 → DevTools) | 🟡 Built. **On this PC another program already owns F12 as a global shortcut** (F9, F10, F11 and Ctrl+Shift+Space are free), so F12 can't be blocked here. The app now shows this warning in Settings → Voice and on Voice Typing |
| Extra hotkeys: cancel, open window, paste last, cycle mode | ✅ Built |
| Floating widget: non-focusable, DPI-aware, waveform, timer, language, states RECORDING → … → SUCCESS/ERROR, cancel button | ✅ Built (rendered) · 🟡 Visual check during real dictation on Retina and 150% Windows scaling |
| Paste into the active app (clipboard + Ctrl/Cmd+V, clipboard restored) | 🟡 Built; needs real-world checks in Word/Chrome/Telegram/VS Code. Known OS limits: elevated (admin) windows on Windows, secure input fields |
| Mic unplugged / recorder crash / no audio / silence | ✅ Handled in code and unit tests · 🟡 physical unplug not tested |
| Tray / menu bar menu | ✅ Created · 🟡 menu items clicked manually only |

## 1.0.1 additions

| Feature | Status |
|---|---|
| Language picker on the dictation key (your 3 languages, ← → / 1-3 / click, F12 confirms, countdown 2–8 s) | ✅ Unit tests and real-speech E2E (the picker chose Russian / English) · 🟡 the arrow keys still need a check in Chrome/Word by hand |
| Recognition restricted to your three languages; all ~100 Whisper languages selectable | ✅ |
| Live typing: phrase-by-phrase insertion after each pause | ✅ Unit tests (order, spacing, silent tail) and a real English run split into 2 phrases · 🟡 pasting into other apps by hand |
| Text always left on the clipboard (also when pasting fails) | ✅ Unit tests |
| whisper-server engine (model stays loaded, prewarmed while choosing) | ✅ Real runs: ready in ≈0.5 s, ≈1.8 s per phrase with the Base model on CPU |
| Installer shows "Update x → y" over an installed version | ✅ Seen on this PC: "Обновление VoiceFlow AI — Версия 0.1.0 → 1.0.1" with «Обновить» (closed without installing) |

## 1.0.2 fixes

| Fix | Status |
|---|---|
| "Speech not detected" shown while a long phrase was still being recognised (15 s watchdog fired during slow CPU recognition) | ✅ The watchdog now only fires when the recorder never delivers audio (new error "recorder failed"); unit-tested |
| Speed: 10 s encoder window (`--audio-ctx 512`), phrases cut at pauses and at ≤ 9.5 s at the quietest moment, up to 16 threads | ✅ Large v3 Turbo on an i9-9900K: 8.7 s phrase ≈ 6 s (was 20–30 s), identical text |
| NVIDIA GPU acceleration (CUDA 12.4 build, one-click install, automatic CPU fallback) | ✅ GTX 1050 Ti: 8.7 s phrase in 0.78 s with Large v3 Turbo, 0.12–0.3 s with Base; real-speech E2E on GPU and CPU |
| Engine runs at below-normal priority, warms up on install / model change | ✅ Real-speech E2E with `CUDA_CACHE_DISABLE=1` (cold kernel compile during dictation): no audio lost |
| Non-live mode: whole text inserted once at the end | ✅ Unit tests |

## Speech recognition

| Feature | Status |
|---|---|
| whisper.cpp provider (child process, JSON output, detected language and engine probability, vocabulary `--prompt`, quality presets, threads, GPU toggle) | ✅ Run for real with the Base model (Russian + English); 🟡 Large v3 Turbo and Tajik speech not tested yet |
| One-click whisper.cpp download (Windows x64, official GitHub release, digest check) | ✅ Ran for real; this run caught and fixed two bugs: an asset-less "latest" release, and the deprecated `main.exe` stub being picked |
| Model manager: catalogue, download with progress and cancel, SHA-256 from Hugging Face, delete, choose | ✅ Downloaded and verified `ggml-base.bin` (148 MB) from Hugging Face |
| OpenAI / Groq / OpenAI-compatible (faster-whisper server) transcription | 🟡 Request and response format unit-tested; needs your API key / server |
| Language modes: auto / single / multiple-allowed (with re-run) | ✅ Logic unit-tested · 🟡 accuracy with real Tajik speech unverified |
| Per-segment language for mixed speech | ✅ Text-based heuristic per sentence (Whisper itself returns one language per request — not hidden) |
| No invented confidence | ✅ Only the engine's own probability is shown, when whisper.cpp reports one |

## Text intelligence

| Feature | Status |
|---|---|
| RAW (local only), CORRECT, PROFESSIONAL with separate prompts; Tajik and Russian guidance; dictionary spellings; custom instructions | ✅ Built, prompts unit-tested · 🟡 **quality of Tajik correction depends on the chosen LLM and hasn't been evaluated** (no key here) |
| Never translate / never add facts; output cleaning; length safety guard; fallback to raw | ✅ Unit-tested |
| Original / corrected / final stored; diff in History; re-process as another mode | ✅ Built |
| AI assistant panel: fix, rewrite, professional, translate (en/ru/tg/uz/tr/ar/fa/de/fr), explain, shorten, expand, tone, continue, summarise; sends only the selection plus a small context window; preview + diff before applying; one-step undo; snapshot before applying | ✅ Built · 🟡 needs a provider |
| Voice commands (13 editor commands + 8 AI commands, en/ru/tg phrases, whole-utterance only, can be turned off) | ✅ Unit-tested |
| Personal dictionary (vocabulary hint + post-replacement, language-scoped, aliases, live test) | ✅ |

## Documents

| Feature | Status |
|---|---|
| Tiptap editor: H1–H3, bold/italic/underline/strike, highlight, colour, font size, alignment, lists, quote, code block, tables (with row/column operations), images, links, divider, undo/redo, shortcuts, context menu, word count | ✅ (E2E for heading/table/typing) |
| Create, rename, duplicate, folders, move, favourites, search, sort, trash/restore/delete forever | ✅ (repository tests + UI) |
| Debounced autosave (900 ms), Saving/Saved/Error with backoff retry, crash-recovery draft, flush on quit | ✅ (E2E persistence across restart) |
| Version history (throttled snapshots, 50 kept, manual snapshot, diff, restore) | ✅ |
| Export DOCX / PDF / Markdown / TXT / HTML | ✅ DOCX and PDF verified with Tajik letters |
| Import DOCX (mammoth) / Markdown / TXT / HTML, sanitised | ✅ Sanitiser tested · 🟡 complex DOCX formatting is limited by mammoth (e.g. no colours or fonts) |
| Templates: 10 built-in, localised; save any document as a template | ✅ |

## App, platform and security

| Feature | Status |
|---|---|
| Dashboard with real statistics (no placeholder numbers), engine status | ✅ |
| History: search, filter, copy, re-process, delete, clear, export CSV/JSON/TXT | ✅ |
| Settings: all sections from the brief | ✅ |
| Onboarding (10 steps) | ✅ Built; first step covered by E2E |
| Localisation en / ru / tg (type-checked for completeness) | ✅ |
| iOS-style design system: themes light/dark/system, 6 accents, compact mode, reduced motion, Dynamic-Island widget, ⌘K command palette, macOS menu bar and vibrancy | ✅ Windows · 🟡 macOS vibrancy to be seen on a Mac |
| Security: contextIsolation, sandbox, no nodeIntegration, CSP, sender checks, zod validation, navigation/window.open blocked, https-only providers, no eval | ✅ (E2E) |
| Secrets in DPAPI/Keychain via safeStorage | ✅ Windows · 🟡 macOS Keychain |
| Backups (manual, daily/weekly schedule, restore, export settings; no keys) | ✅ |
| Launch at login, close to tray | 🟡 Built; check after installing |
| In-app updates from GitHub Releases (sidebar Update button, SHA-512 check, Restart and update; macOS bundle swap) | ✅ The packaged Windows app reads the live feed of `imomzoda-dev/VoiceFlowAI` (E2E with `VOICEFLOW_CHECK_FEED=1`) · 🟡 an actual 1.0.0 → 1.0.1 install, and the macOS swap, are verified with the next release |
| Code signing / notarization | ⬜ Needs your certificates |
| Rust native helper | ⬜ No Rust toolchain on this machine; libuiohook is used behind an interface (see `native/README.md`) |
| Live streaming (partial) transcription | ⬜ Not implemented; recognition runs after release |
| macOS build and test | 🟡 CI workflow ready (DMG + ZIP for arm64 and x64, bundle + update-package checks, packaged-app test); waiting for GitHub Actions billing on the account |

## Needs your action / a target-OS check

1. **Pick a free hotkey** (F12 is taken on this PC, e.g. use F9). Download **Large v3 Turbo (quantised)**. Dictate into Chrome (brief's Test A), then into the editor with real Tajik speech and mixed ru/en/tg speech (Tests B/C).
2. **Add an API key** (OpenAI, Groq or Anthropic) or a local Ollama, to evaluate CORRECT/PROFESSIONAL quality on real Tajik and Russian text (Test E).
3. **Offline test** (Test F): after the model is downloaded, disconnect from the network and dictate.
4. **macOS:** build with `npm run dist:mac`, grant Microphone, Accessibility and Input Monitoring, and repeat Tests A–F (Test G).
