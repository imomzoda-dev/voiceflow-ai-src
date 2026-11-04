/**
 * Native application menu.
 *  - macOS: full menu bar (App, File, Edit, View, Dictation, Window, Help). The Edit menu is
 *    required on macOS for ⌘C / ⌘V / ⌘X / ⌘A to work in text fields.
 *  - Windows: no menu bar (shortcuts are handled in the renderer), matching modern Windows apps.
 */
import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import type { AppContext } from './app-context'
import type { ProcessingMode } from '../../shared/settings'
import { EVT } from '../../shared/channels'

export function buildAppMenu(ctx: AppContext) {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const s = (k: string) => ctx.str(k)
  const send = (target: string) => {
    ctx.showMain()
    ctx.mainWindow?.webContents.send(EVT.navigate, target)
  }
  const mode = ctx.settings.get().writing.mode
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: s('settings'), accelerator: 'Command+,', click: () => send('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: s('quit') }
      ]
    },
    {
      label: s('menuFile'),
      submenu: [
        { label: s('newDocument'), accelerator: 'Command+N', click: () => send('action:new-document') },
        { label: s('commandPalette'), accelerator: 'Command+K', click: () => send('action:palette') },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    { role: 'editMenu' },
    {
      label: s('menuView'),
      submenu: [
        ...(app.isPackaged ? [] : ([{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }] as MenuItemConstructorOptions[])),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: s('menuDictation'),
      submenu: [
        { label: ctx.dictation.isRecording() ? s('stop') : s('dictate'), click: () => void ctx.dictation.toggle() },
        { label: s('pasteLast'), click: () => void ctx.dictation.pasteLast() },
        { type: 'separator' },
        ...(['raw', 'correct', 'professional'] as ProcessingMode[]).map<MenuItemConstructorOptions>((m) => ({
          label: s(m),
          type: 'radio',
          checked: mode === m,
          click: () => void ctx.settings.update('writing', { mode: m })
        }))
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: s('openLogs'), click: () => void shell.openPath(ctx.paths.logs) },
        { label: 'whisper.cpp', click: () => void shell.openExternal('https://github.com/ggml-org/whisper.cpp') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
