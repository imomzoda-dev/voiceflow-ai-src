/**
 * Composition root: constructs every main-process service once and wires them together.
 * IPC modules receive this context; nothing else holds global state.
 */
import { app, BrowserWindow, Notification, safeStorage, systemPreferences } from 'electron'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { openDatabase, runMigrations, type DatabaseHandle } from '../db/client'
import { DocumentsRepository } from '../db/documents-repo'
import { DictationsRepository } from '../db/dictations-repo'
import { BackupsRepository, DictionaryRepository, ProvidersRepository, SettingsRepository, SpeechModelsRepository, TemplatesRepository } from '../db/misc-repos'
import { SettingsService } from '../services/settings-service'
import { SecretsService } from '../services/secrets-service'
import { ProviderService } from '../services/ai/provider-service'
import { TextProcessor } from '../services/ai/text-processor'
import { LocalSpeechService } from '../services/speech/local-speech-service'
import { WhisperCppProvider } from '../services/speech/whisper-cpp'
import { SpeechError } from '../services/speech/types'
import { WhisperServerManager, WhisperServerProvider, serverBinaryFor } from '../services/speech/whisper-server'
import { catalogModel } from '../services/speech/model-catalog'
import { UiohookBridge } from '../native/uiohook-bridge'
import type { NativeInputBridge } from '../native/input-bridge'
import { HotkeyManager } from './hotkey-manager'
import { ClipboardService, TypingService } from '../services/typing-service'
import { DictationService, type PrewarmableSpeech } from '../services/dictation-service'
import { FileService } from '../services/file-service'
import { BackupService } from '../services/backup-service'
import { TrayManager } from './tray-manager'
import { buildAppMenu } from './app-menu'
import { UpdaterService } from '../services/updates/updater-service'
import { join } from 'node:path'
import { appPaths, type AppPaths } from './paths'
import { createMainWindow, createOverlayWindow, positionOverlay } from './window-manager'
import { EVT } from '../../shared/channels'
import { MAIN_STRINGS } from '../../shared/main-strings'
import type { AppSettings, ProcessingMode } from '../../shared/settings'
import type { DictationErrorCode, DictationState } from '../../shared/types'
import type { RecorderCommand } from '../../shared/api'
import { createLogger } from './logger'

const log = createLogger('app')

export class AppContext {
  readonly paths: AppPaths
  readonly h: DatabaseHandle
  readonly documents: DocumentsRepository
  readonly dictations: DictationsRepository
  readonly dictionary: DictionaryRepository
  readonly templates: TemplatesRepository
  readonly providersRepo: ProvidersRepository
  readonly speechModels: SpeechModelsRepository
  readonly backupsRepo: BackupsRepository
  readonly settings: SettingsService
  readonly secrets: SecretsService
  readonly providers: ProviderService
  readonly processor: TextProcessor
  readonly localSpeech: LocalSpeechService
  readonly bridge: NativeInputBridge
  readonly hotkeys: HotkeyManager
  readonly typing: TypingService
  readonly dictation: DictationService
  readonly files: FileService
  readonly backup: BackupService
  readonly tray: TrayManager
  readonly updater: UpdaterService
  readonly clipboard: ClipboardService
  readonly whisperServer = new WhisperServerManager()

  mainWindow: BrowserWindow | null = null
  overlayWindow: BrowserWindow | null = null
  editorFocused = false
  quitting = false

  private constructor(h: DatabaseHandle, paths: AppPaths) {
    this.paths = paths
    this.h = h
    this.documents = new DocumentsRepository(h)
    this.dictations = new DictationsRepository(h)
    this.dictionary = new DictionaryRepository(h)
    this.templates = new TemplatesRepository(h)
    this.providersRepo = new ProvidersRepository(h)
    this.speechModels = new SpeechModelsRepository(h)
    this.backupsRepo = new BackupsRepository(h)
    this.settings = new SettingsService(new SettingsRepository(h))
    this.secrets = new SecretsService(paths.secrets, safeStorage)
    this.providers = new ProviderService(this.providersRepo, this.secrets)
    this.processor = new TextProcessor(this.providers, () => this.settings.get())
    this.localSpeech = new LocalSpeechService(
      { models: paths.models, bin: paths.bin, temp: paths.temp, resources: app.isPackaged ? process.resourcesPath : app.getAppPath() },
      this.speechModels,
      () => this.settings.get().recognition.whisperBinaryPath
    )
    this.updater = new UpdaterService(app.getVersion(), app.isPackaged, join(paths.temp, 'updates'))
    this.bridge = new UiohookBridge()
    this.hotkeys = new HotkeyManager(this.bridge)
    this.clipboard = new ClipboardService()
    this.typing = new TypingService(this.bridge, this.clipboard, () => this.hotkeys.matcher.modifiersDown(), process.platform, () =>
      process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : true
    )
    this.files = new FileService(() => this.mainWindow)
    this.backup = new BackupService(h, this.backupsRepo, app.getVersion())
    this.tray = new TrayManager({
      show: (page) => this.showMain(page),
      toggleDictation: () => void this.dictation.toggle(),
      pasteLast: () => void this.dictation.pasteLast(),
      setMode: (m) => void this.settings.update('writing', { mode: m }),
      quit: () => app.quit()
    })
    this.dictation = new DictationService({
      settings: () => this.settings.get(),
      recorder: {
        start: (c) => this.sendRecorder({ type: 'start', ...c }),
        stop: (sessionId) => this.sendRecorder({ type: 'stop', sessionId }),
        cancel: (sessionId) => this.sendRecorder({ type: 'cancel', sessionId })
      },
      output: {
        editorFocused: () => this.editorFocused && !!this.mainWindow && this.mainWindow.isFocused(),
        insertIntoEditor: (text, resultId) => this.mainWindow?.webContents.send(EVT.editorInsert, { text, resultId }),
        commandEditor: (command, resultId) => this.mainWindow?.webContents.send(EVT.editorCommand, { command, resultId }),
        copyText: (text) => this.clipboard.writeText(text),
        insertExternal: async (text, opts) => {
          const r = await this.typing.insert(text, opts)
          if (!r.ok) this.notify(this.str(r.error === 'accessibility' ? 'accessibilityNeeded' : 'insertFailed'))
          return r
        }
      },
      speech: () => this.speechProvider(),
      processor: this.processor,
      dictionary: () => this.dictionary.list(),
      history: this.dictations,
      dirs: { temp: paths.temp, audio: paths.audio },
      preflight: () => this.preflight(),
      isDictateHeld: () => this.hotkeys.matcher.isHeld('dictate')
    })
  }

  static async create(): Promise<AppContext> {
    const paths = appPaths()
    const h = openDatabase(paths.database)
    await runMigrations(h, paths.migrations)
    const ctx = new AppContext(h, paths)
    await ctx.settings.load()
    await ctx.templates.seedBuiltins()
    ctx.wire()
    return ctx
  }

  str(key: string): string {
    const lang = this.settings.get().general.uiLanguage
    return MAIN_STRINGS[lang][key] ?? MAIN_STRINGS.en[key] ?? key
  }

  private wire() {
    this.settings.on('change', (s: AppSettings, prev: AppSettings) => {
      this.broadcast(EVT.settings, s)
      if (s.voice !== prev.voice) this.hotkeys.apply(s)
      if (s.general.launchAtLogin !== prev.general.launchAtLogin) this.applyLoginItem(s)
      this.refreshTray()
      buildAppMenu(this)
    })
    this.dictation.on('state', (st: DictationState) => this.onDictationState(st))
    this.dictation.on('result', (r) => this.broadcast(EVT.dictationResult, r))
    this.hotkeys.on('press', (a) => this.onHotkeyPress(a))
    this.hotkeys.on('release', (a) => this.onHotkeyRelease(a))
    this.hotkeys.on('pick', (delta: number) => this.dictation.movePick(delta))
    this.hotkeys.on('pickConfirm', () => this.dictation.confirmPick())
    this.hotkeys.on('pickIndex', (i: number) => this.dictation.choosePick(i))
    this.hotkeys.on('chord', () => {
      if (this.dictation.isRecording()) this.dictation.cancel()
    })
    this.localSpeech.on('progress', (p) => this.mainWindow?.webContents.send(EVT.modelProgress, p))
    this.updater.on('state', (s) => this.mainWindow?.webContents.send(EVT.updateState, s))
  }

  /* --------------------------------- windows --------------------------------- */

  createWindows(showMain: boolean) {
    this.mainWindow = createMainWindow({ show: showMain })
    this.mainWindow.on('close', (e) => {
      if (this.quitting) return
      if (this.settings.get().general.closeBehavior === 'tray' || process.platform === 'darwin') {
        e.preventDefault()
        this.mainWindow?.hide()
        this.maybeNotifyTray()
      }
    })
    this.mainWindow.on('closed', () => (this.mainWindow = null))
    // macOS: the keyboard hook can only start after Accessibility/Input Monitoring is granted.
    // Retry whenever the user comes back to the app (e.g. from System Settings).
    this.mainWindow.on('focus', () => {
      if (!this.bridge.isRunning()) this.hotkeys.start()
    })
    this.mainWindow.webContents.on('render-process-gone', (_e, d) => log.error('Main renderer crashed', { reason: d.reason }))
    this.ensureOverlay()
  }

  private trayHintShown = false
  private maybeNotifyTray() {
    if (this.trayHintShown) return
    this.trayHintShown = true
    this.notify(this.str('stillRunning'))
  }

  ensureOverlay(): BrowserWindow {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) return this.overlayWindow
    const win = createOverlayWindow()
    win.webContents.on('render-process-gone', (_e, d) => {
      log.error('Overlay renderer crashed; recreating', { reason: d.reason })
      this.overlayWindow = null
      if (this.dictation.isBusy()) this.dictation.recorderError(this.dictation.getState().sessionId ?? '', 'mic-unavailable', 'Recorder crashed')
      setTimeout(() => this.ensureOverlay(), 500)
    })
    win.on('closed', () => (this.overlayWindow = null))
    this.overlayWindow = win
    return win
  }

  showMain(page?: string) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) this.mainWindow = createMainWindow({ show: true })
    if (this.mainWindow.isMinimized()) this.mainWindow.restore()
    this.mainWindow.show()
    this.mainWindow.focus()
    if (page) this.mainWindow.webContents.send(EVT.navigate, page)
  }

  broadcast(channel: string, payload: unknown) {
    for (const w of [this.mainWindow, this.overlayWindow]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
  }

  private sendRecorder(cmd: RecorderCommand) {
    const win = this.ensureOverlay()
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => win.webContents.send(EVT.recorderCommand, cmd))
    else win.webContents.send(EVT.recorderCommand, cmd)
  }

  private onDictationState(st: DictationState) {
    this.broadcast(EVT.dictationState, st)
    const overlay = this.ensureOverlay()
    // The island grows for the language picker and for live text; the window follows it.
    const height = st.phase === 'selecting' ? 134 : st.phase !== 'idle' && st.liveText ? 118 : 76
    if (st.phase === 'idle') {
      if (overlay.isVisible()) overlay.hide()
    } else if (!overlay.isVisible() || overlay.getBounds().height !== height) {
      positionOverlay(overlay, this.settings.get().voice.widgetPosition, height)
      if (!overlay.isVisible()) overlay.showInactive()
    }
    this.hotkeys.armCancel(['selecting', 'recording', 'processing', 'correcting'].includes(st.phase))
    this.hotkeys.setPicker(st.phase === 'selecting')
    this.refreshTray()
  }

  notify(body: string) {
    if (!this.settings.get().general.notifications || !Notification.isSupported()) return
    new Notification({ title: 'VoiceFlow AI', body, silent: true }).show()
  }

  refreshTray() {
    const s = this.settings.get()
    this.tray.update(
      {
        open: this.str('open'),
        dictate: this.str('dictate'),
        stop: this.str('stop'),
        pasteLast: this.str('pasteLast'),
        mode: this.str('mode'),
        modes: { raw: this.str('raw'), correct: this.str('correct'), professional: this.str('professional') },
        settings: this.str('settings'),
        quit: this.str('quit'),
        tooltip: this.str('tooltip'),
        recording: this.str('recording')
      },
      { recording: this.dictation.isRecording(), mode: s.writing.mode }
    )
  }

  applyLoginItem(s: AppSettings) {
    try {
      app.setLoginItemSettings({ openAtLogin: s.general.launchAtLogin, args: ['--hidden'] })
    } catch (e) {
      log.warn('setLoginItemSettings failed', e)
    }
  }

  /* --------------------------------- hotkeys --------------------------------- */

  private onHotkeyPress(action: string) {
    const s = this.settings.get()
    switch (action) {
      case 'dictate':
        void this.dictation.onKeyPress()
        break
      case 'cancel':
        if (this.dictation.isBusy()) this.dictation.cancel()
        break
      case 'openWindow':
        this.showMain()
        break
      case 'pasteLast':
        void this.dictation.pasteLast()
        break
      case 'cycleMode': {
        const order: ProcessingMode[] = ['raw', 'correct', 'professional']
        const next = order[(order.indexOf(s.writing.mode) + 1) % order.length]
        void this.settings.update('writing', { mode: next })
        this.notify(`${this.str('mode')}: ${this.str(next)}`)
        break
      }
    }
  }

  private onHotkeyRelease(action: string) {
    if (action === 'dictate') this.dictation.onKeyRelease()
  }

  /* ------------------------------- speech engine ------------------------------- */

  async preflight(): Promise<{ ok: true } | { ok: false; code: DictationErrorCode; message: string }> {
    const s = this.settings.get()
    const id = s.recognition.speechProviderId
    if (id === 'whisper-cpp') {
      const bin = await this.localSpeech.binaryStatus()
      if (!bin.found) return { ok: false, code: 'binary-missing', message: 'whisper.cpp is not installed' }
      if (!this.localSpeech.modelPath(s.recognition.whisperModel)) return { ok: false, code: 'model-missing', message: `Model "${catalogModel(s.recognition.whisperModel)?.label ?? s.recognition.whisperModel}" is not downloaded` }
      return { ok: true }
    }
    const p = await this.providers.get(id)
    if (!p || !p.supportsTranscription || !p.transcriptionModel) return { ok: false, code: 'provider-missing', message: 'The selected speech provider is not configured' }
    if (!p.isLocal && !s.privacy.allowCloud) return { ok: false, code: 'cloud-not-allowed', message: 'Cloud processing is disabled in Privacy settings' }
    if (!p.isLocal && !p.hasKey) return { ok: false, code: 'invalid-key', message: `No API key saved for ${p.name}` }
    return { ok: true }
  }

  async speechProvider(): Promise<PrewarmableSpeech> {
    const s = this.settings.get()
    const r = s.recognition
    if (r.speechProviderId === 'whisper-cpp') {
      const bin = await this.localSpeech.binaryStatus()
      const modelPath = this.localSpeech.modelPath(r.whisperModel)
      // Prefer the persistent server (the model stays loaded: fast phrase-by-phrase live typing).
      if (bin.path && modelPath && serverBinaryFor(bin.path)) {
        return new WhisperServerProvider(this.whisperServer, { cliPath: bin.path, modelPath, modelId: r.whisperModel, threads: r.threads, useGpu: r.useGpu })
      }
      return new WhisperCppProvider({
        binaryPath: bin.path,
        modelPath: this.localSpeech.modelPath(r.whisperModel),
        modelId: r.whisperModel,
        threads: r.threads,
        quality: r.quality,
        useGpu: r.useGpu
      })
    }
    const p = await this.providers.get(r.speechProviderId)
    if (p && !p.isLocal && !s.privacy.allowCloud) throw new SpeechError('cloud-not-allowed', 'Cloud processing is disabled')
    return this.providers.transcriber(r.speechProviderId)
  }

  /* ------------------------------- maintenance ------------------------------- */

  async runMaintenance() {
    const s = this.settings.get()
    try {
      if (s.storage.historyRetentionDays > 0) {
        const paths = await this.dictations.pruneOlderThan(Date.now() - s.storage.historyRetentionDays * 86400000)
        for (const p of paths) await rm(p, { force: true })
      }
      const old = await this.dictations.audioPaths(Date.now() - s.storage.audioRetentionDays * 86400000)
      for (const a of old) await rm(a.audioPath, { force: true })
      await this.dictations.clearAudioRefs(old.map((a) => a.id))
    } catch (e) {
      log.warn('Retention cleanup failed', e)
    }
    await this.runScheduledBackup()
  }

  private async runScheduledBackup() {
    const b = this.settings.get().backup
    if (b.schedule === 'off' || !b.directory || !existsSync(b.directory)) return
    const interval = b.schedule === 'daily' ? 86400000 : 7 * 86400000
    if (b.lastBackupAt && Date.now() - b.lastBackupAt < interval) return
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
    const info = await this.backup.createAt(`${b.directory}/voiceflow-auto-${stamp}.vfbackup`, 'scheduled')
    if (info.status === 'ok') {
      await this.backup.prune(b.directory, b.keep)
      await this.settings.update('backup', { lastBackupAt: info.createdAt })
    }
  }

  async shutdown() {
    this.dictation.cancel()
    this.hotkeys.stop()
    this.updater.stop()
    this.whisperServer.stop()
    this.tray.destroy()
    try {
      this.h.close()
    } catch (e) {
      log.warn('DB close failed', e)
    }
  }
}
