# VoiceFlow AI

> **Your Voice. Your Words. Your Intelligence.**

A desktop voice-typing and document workspace for Windows and macOS. Hold a hotkey in any app, speak (Tajik, Russian, English and any language Whisper supports), release it, and the recognised text, optionally corrected by AI, is inserted at the cursor. VoiceFlow AI also has its own rich-text document editor with dictation, an AI assistant, version history and DOCX/PDF/Markdown export.

- Feature status (what works, what still needs target-OS checks): [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md)
- Architecture and decisions: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Native layer: [native/README.md](native/README.md)
- Releases and updates: [docs/RELEASING.md](docs/RELEASING.md). Public downloads: <https://github.com/imomzoda-dev/VoiceFlowAI/releases>

---

## 1. Run from source

Requirements: **Node.js 22.13+** (24 recommended) and npm. No Python, Rust or C++ toolchain is needed: SQLite is Electron's built-in `node:sqlite`, and the keyboard hook ships prebuilt.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` starts Electron with hot reload. Other scripts:

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript for the main and renderer processes |
| `npm test` | Unit tests (Vitest), including a real SQLite database |
| `npm run test:e2e` | Builds, then drives the real Electron app with Playwright |
| `VOICEFLOW_SPEECH_DIR=<dir> npx playwright test speech` | Opt-in real speech test. Put `ru.wav` / `en.wav` in `<dir>`; it downloads whisper.cpp and a model into `<dir>/profile`, then dictates through a fake microphone |
| `npm run build` | Production bundle in `out/` |
| `npm start` | Runs the production bundle |
| `npm run dist:win` / `npm run dist:mac` | Installers (see sections 5 and 6) |
| `npm run db:generate` | New SQL migration after editing `database/schema.ts` |

On first launch a 10-step setup wizard walks you through language, microphone, hotkey, local or cloud recognition, model download, optional AI provider, permissions and a test dictation.

## 2. Install local speech recognition (whisper.cpp)

Everything is in **Settings → Recognition**. Nothing is downloaded without a click.

1. **Engine (`whisper-cli`)**
   - **Windows x64:** click **Download whisper.cpp**. The official `whisper-bin-x64.zip` is fetched from the latest [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp/releases) release, its SHA-256 is checked when GitHub publishes it, and it is extracted to `%APPDATA%\VoiceFlow AI\bin\whisper`.
   - **macOS:** run the command below. `/opt/homebrew/bin/whisper-cli` is detected automatically.
     ```bash
     brew install whisper-cpp
     ```
   - **Any OS:** you can also point the app at your own build with **Choose whisper-cli…**. A GPU build (CUDA, Metal, Vulkan) works the same way.
2. **Model:** click **Download** next to a model. Files come from `huggingface.co/ggerganov/whisper.cpp` and are checked against the SHA-256 that Hugging Face publishes (`x-linked-etag`). Models marked *Verified* passed that check.

| Model | Size | Notes |
|---|---|---|
| Large v3 Turbo (quantised) | ≈ 550 MB | **Recommended**: best accuracy per MB; good for Tajik and Russian |
| Medium (quantised) | ≈ 515 MB | Alternative for slower CPUs |
| Small / Base / Tiny | 75–470 MB | Fast, much weaker for Tajik |
| Large v3 | ≈ 3.1 GB | Highest accuracy, slow on CPU |

Models are stored in the data folder (`…/VoiceFlow AI/models`). **Open models folder** shows them.

**Tajik tip:** Whisper sometimes labels Tajik speech as Russian or Persian. Set **Language detection → Detect among selected languages** with Tajik (and Russian/English) selected. VoiceFlow AI then re-runs recognition forced to the right language, and also checks the text for Tajik-only letters (ғ қ ӯ ҳ ҷ ӣ).

## 3. Connect AI APIs (optional)

**Settings → AI Providers → Add provider.** Each provider can serve speech recognition, text (correction and assistant), or both. You choose providers separately for each role: Recognition engine, Correction provider, and Document assistant provider.

| Service | Endpoint | Speech model | Text model |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `whisper-1` (returns the detected language), `gpt-4o-transcribe` | e.g. `gpt-4.1-mini` |
| Groq | `https://api.groq.com/openai/v1` | `whisper-large-v3-turbo` | e.g. `llama-3.3-70b-versatile` |
| Anthropic | `https://api.anthropic.com` | — | e.g. `claude-sonnet-5-5` |
| OpenRouter | `https://openrouter.ai/api/v1` | — | any |
| Ollama (local) | `http://localhost:11434/v1` | — | e.g. `qwen3:8b` |
| LM Studio (local) | `http://localhost:1234/v1` | — | loaded model |
| faster-whisper server (local) | `http://localhost:8000/v1` | e.g. `Systran/faster-whisper-large-v3` | — |

- **Test connection** lists the provider's models (no tokens are used) and fills the model picker.
- Keys are encrypted with Electron `safeStorage` (Windows **DPAPI**, macOS **Keychain**). They are stored in `secrets.bin` and never in SQLite, settings, logs or backups, and never sent to the renderer process.
- Cloud use must be switched on under **Settings → Privacy → Allow cloud processing**. Until then, no audio or text leaves the computer.
- Endpoints must be `https://`, except `localhost` servers. TLS certificate checks are never disabled.
- **faster-whisper:** run an OpenAI-compatible server such as [speaches](https://github.com/speaches-ai/speaches) and add it with the "faster-whisper server" preset.

**Processing modes:**
- **Raw:** local clean-up only; no AI call.
- **Correct:** grammar, spelling and punctuation, keeping your wording.
- **Professional:** polished, structured text with the same meaning.

The prompts forbid translating, adding facts or changing meaning. A length guard rejects runaway rewrites, and if AI fails the original transcript is inserted. Every dictation keeps the original, corrected and final text in **History**, with a word-level diff.

## 4. Using it

- **Anywhere:** hold **F12** (configurable) → speak → release. A small widget shows the waveform, timer, language and status, and it never takes keyboard focus. The text is pasted at the cursor and your clipboard is restored afterwards.
  - Toggle mode: press to start, press again to stop.
  - Manual mode: use the record button only.
  - **Esc** cancels while recording.
- **In the editor:** dictation goes straight into the document. If you say a command on its own, it runs instead: “новый абзац”, “new line”, “сарлавҳаи нав”, “удали последнее предложение”, “переведи на английский”, and so on. The full list is on the Voice Typing page.
- **Tray / menu bar:** start or stop dictation, paste the last dictation, switch mode, open settings, quit.

## 5. Build for Windows

```bash
npm run dist:win
```

This produces `release/<version>/VoiceFlow-AI-Setup-<version>-x64.exe`: an NSIS installer with a choice of install folder, desktop and Start-menu shortcuts, and a working uninstaller. "Launch at login" is a user setting (Settings → General) and is off by default.

Code signing: set `CSC_LINK` / `CSC_KEY_PASSWORD` to your certificate before building. Without them the installer is **unsigned**, and SmartScreen will warn.

## 6. Build for macOS (run on a Mac)

```bash
npm install
```

```bash
npm run dist:mac
```

This produces `VoiceFlow-AI-<version>-arm64.dmg` and `…-x64.dmg`. The entitlements (`resources/build/entitlements.mac.plist`) cover microphone access and the hardened runtime. `Info.plist` gets the microphone and Apple-events usage strings.

**Signing and notarization:** this needs a real Apple Developer ID; the repository includes **no certificates**. Set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, then set `mac.notarize: true` in `electron-builder.yml`. Without them the DMG is unsigned, and Gatekeeper requires right-click → Open.

**macOS permissions the user grants on first use:**
- Microphone
- Accessibility (to paste)
- Input Monitoring (to see the hotkey being pressed and released)

After granting Accessibility, use **Allow** again in Settings → Voice Typing → Permissions (or restart the app) so the keyboard hook can start.

## 7. Data and privacy

Data folder:
- Windows: `%APPDATA%\VoiceFlow AI`
- macOS: `~/Library/Application Support/VoiceFlow AI`

It contains `voiceflow.db` (SQLite with WAL), `models/`, `bin/`, `secrets.bin` (encrypted) and `logs/`.

- Audio is **not** kept unless you turn on **Settings → Storage → Save recordings**. Recordings then expire after the period you choose.
- Logs never contain keys, document text or dictation text.
- **Backups** (`*.vfbackup`, gzip JSON) can be made manually or on a daily/weekly schedule. They exclude API keys and audio.
