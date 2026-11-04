/**
 * VoiceFlow AI — main process entry. Kept intentionally small: lifecycle only.
 * Services are composed in app-context.ts; IPC lives in electron/ipc/*.
 */
import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { appPaths } from './paths'
import { createLogger, initLogger } from './logger'
import { AppContext } from './app-context'
import { buildAppMenu } from './app-menu'
import { configureSession, rendererDir } from './window-manager'
import { configureTrust } from '../ipc/guard'
import { registerDocumentsIpc } from '../ipc/documents.ipc'
import { registerSettingsIpc } from '../ipc/settings.ipc'
import { registerAudioIpc } from '../ipc/audio.ipc'
import { registerSystemIpc } from '../ipc/system.ipc'
import { EVT, SEND } from '../../shared/channels'

// node:sqlite prints an ExperimentalWarning on Node 24; it is stable enough for our use.
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.warn(w)
})

const log = createLogger('main')

// Isolated profile for automated tests / portable use. Must run before app 'ready'.
if (process.env.VOICEFLOW_USER_DATA) {
  app.setPath('userData', process.env.VOICEFLOW_USER_DATA)
  app.setAppLogsPath(join(process.env.VOICEFLOW_USER_DATA, 'logs'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let ctx: AppContext | null = null

  app.on('second-instance', () => ctx?.showMain())

  process.on('uncaughtException', (e) => log.error('Uncaught exception', e))
  process.on('unhandledRejection', (e) => log.error('Unhandled rejection', e))

  app.whenReady().then(async () => {
    initLogger(appPaths().logs)
    log.info(`Starting VoiceFlow AI ${app.getVersion()} on ${process.platform}-${process.arch}`)
    if (process.platform === 'win32') app.setAppUserModelId('ai.voiceflow.desktop')
    configureSession()
    configureTrust({ devServerUrl: app.isPackaged ? null : (process.env.ELECTRON_RENDERER_URL ?? null), rendererDir: rendererDir() })

    try {
      ctx = await AppContext.create()
    } catch (e) {
      log.error('Fatal: startup failed', e)
      const { dialog } = await import('electron')
      if (!process.env.VOICEFLOW_USER_DATA) dialog.showErrorBox('VoiceFlow AI', `VoiceFlow AI could not start: ${(e as Error).message}\n\nDetails are in the log folder:\n${appPaths().logs}`)
      app.exit(1)
      return
    }
    const c = ctx

    registerDocumentsIpc(c)
    registerSettingsIpc(c)
    registerAudioIpc(c)
    registerSystemIpc(c)

    const s = c.settings.get()
    const hidden = process.argv.includes('--hidden') || (s.general.startMinimized && s.general.onboardingCompleted)
    c.createWindows(!hidden)
    buildAppMenu(c)
    c.tray.create()
    c.refreshTray()
    c.applyLoginItem(s)
    c.hotkeys.apply(s)
    c.hotkeys.start()

    c.updater.schedule(() => c.settings.get().updates.autoCheck)
    void c.runMaintenance()
    setInterval(() => void c.runMaintenance(), 6 * 3600 * 1000).unref()

    // Key-up events can be lost across sleep/lock; reset held-key state.
    powerMonitor.on('resume', () => c.hotkeys.matcher.reset())
    powerMonitor.on('lock-screen', () => {
      c.hotkeys.matcher.reset()
      if (c.dictation.isRecording()) c.dictation.cancel()
    })

    app.on('activate', () => c.showMain())
  })

  /** Ask the renderer to flush pending autosaves before quitting (max 2 s). */
  let flushed = false
  app.on('before-quit', (e) => {
    if (!ctx) return
    ctx.quitting = true
    if (flushed) return
    const win = ctx.mainWindow
    if (!win || win.isDestroyed()) {
      flushed = true
      return
    }
    e.preventDefault()
    const token = randomUUID()
    const done = () => {
      if (flushed) return
      flushed = true
      ipcMain.removeListener(SEND.flushDone, onDone)
      app.quit()
    }
    const onDone = (_ev: unknown, t: string) => {
      if (t === token) done()
    }
    ipcMain.on(SEND.flushDone, onDone)
    win.webContents.send(EVT.flushRequest, token)
    setTimeout(done, 2000)
  })

  app.on('will-quit', () => {
    void ctx?.shutdown()
  })

  app.on('window-all-closed', () => {
    // Keep running in the tray/menu bar; quitting is explicit.
    if (BrowserWindow.getAllWindows().length === 0 && !ctx) app.quit()
  })
}
