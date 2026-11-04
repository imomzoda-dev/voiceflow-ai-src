/**
 * Creates and hardens all BrowserWindows:
 *  - main: the workspace UI
 *  - overlay: the floating dictation widget AND the audio recorder (pre-loaded, hidden, never focusable,
 *    so the app the user is typing into keeps keyboard focus)
 */
import { BrowserWindow, screen, shell, app, nativeTheme, session } from 'electron'
import { join } from 'node:path'
import { createLogger } from './logger'

const log = createLogger('windows')

export const OVERLAY_SIZE = { width: 380, height: 76 }

const ALLOWED_EXTERNAL = [/^https:\/\//]

export function rendererUrl(page: 'index' | 'overlay'): { url?: string; file?: string } {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && dev) return { url: `${dev}/${page}.html` }
  return { file: join(__dirname, `../renderer/${page}.html`) }
}

export function rendererDir(): string {
  return join(__dirname, '../renderer')
}

function securePrefs(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: true,
    devTools: !app.isPackaged
  }
}

function harden(win: BrowserWindow) {
  const wc = win.webContents
  wc.setWindowOpenHandler(({ url }) => {
    if (ALLOWED_EXTERNAL.some((re) => re.test(url))) void shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    const dev = process.env.ELECTRON_RENDERER_URL
    if (dev && url.startsWith(dev)) return
    if (url.startsWith('file://') && url.includes('/renderer/')) return
    e.preventDefault()
    log.warn('Blocked navigation', { url: url.slice(0, 120) })
  })
  wc.on('will-attach-webview', (e) => e.preventDefault())
}

export function configureSession() {
  const ses = session.defaultSession
  // Only the microphone (and clipboard-sanitized-write for copy buttons) may be granted.
  ses.setPermissionRequestHandler((_wc, permission, cb, details) => {
    const allowed = permission === 'media' && (details as Electron.MediaAccessPermissionRequest).mediaTypes?.every((t) => t === 'audio')
    cb(Boolean(allowed) || permission === 'clipboard-sanitized-write')
  })
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'media' || permission === 'clipboard-sanitized-write')
  ses.setDevicePermissionHandler(() => false)
}

async function load(win: BrowserWindow, page: 'index' | 'overlay', hash?: string) {
  const target = rendererUrl(page)
  if (target.url) await win.loadURL(hash ? `${target.url}#${hash}` : target.url)
  else await win.loadFile(target.file!, hash ? { hash } : undefined)
}

export function createMainWindow(opts: { show: boolean }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 920,
    minHeight: 600,
    show: false,
    title: 'VoiceFlow AI',
    // macOS: native translucent sidebar (NSVisualEffectView) behind the transparent web sidebar.
    ...(process.platform === 'darwin'
      ? { vibrancy: 'sidebar' as const, visualEffectState: 'followWindow' as const, backgroundColor: '#00000000' }
      : { backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#f2f2f7' }),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    autoHideMenuBar: true,
    icon: app.isPackaged ? join(process.resourcesPath, 'icons', 'icon.png') : join(app.getAppPath(), 'resources', 'icons', 'icon.png'),
    webPreferences: securePrefs()
  })
  harden(win)
  win.once('ready-to-show', () => {
    if (opts.show) win.show()
  })
  void load(win, 'index')
  return win
}

export function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    ...OVERLAY_SIZE,
    // macOS: a non-activating NSPanel never steals focus from the app being typed into.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { ...securePrefs(), backgroundThrottling: false, spellcheck: false }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setIgnoreMouseEvents(false)
  harden(win)
  void load(win, 'overlay')
  return win
}

/**
 * Places the widget top-centre (just under the menu bar / notch, like the Dynamic Island) or
 * bottom-centre of the display under the cursor. DIP coordinates keep it DPI-aware.
 */
export function positionOverlay(win: BrowserWindow, position: 'top' | 'bottom' = 'top') {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea
  const bx = Math.round(x + (width - OVERLAY_SIZE.width) / 2)
  const by = position === 'top' ? Math.round(y + 2) : Math.round(y + height - OVERLAY_SIZE.height - 28)
  win.setBounds({ x: bx, y: by, ...OVERLAY_SIZE })
}
