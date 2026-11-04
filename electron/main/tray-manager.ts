import { Menu, Tray, nativeImage, app } from 'electron'
import { join } from 'node:path'
import type { ProcessingMode } from '../../shared/settings'

export interface TrayActions {
  show(page?: string): void
  toggleDictation(): void
  pasteLast(): void
  setMode(m: ProcessingMode): void
  quit(): void
}

export interface TrayLabels {
  open: string
  dictate: string
  stop: string
  pasteLast: string
  mode: string
  modes: Record<ProcessingMode, string>
  settings: string
  quit: string
  tooltip: string
  recording: string
}

export class TrayManager {
  private tray: Tray | null = null

  constructor(private readonly actions: TrayActions) {}

  private icon(recording: boolean) {
    const base = app.isPackaged ? join(process.resourcesPath, 'icons') : join(app.getAppPath(), 'resources', 'icons')
    const file = process.platform === 'darwin' ? (recording ? 'trayRecTemplate.png' : 'trayTemplate.png') : recording ? 'tray-rec.png' : 'tray.png'
    const img = nativeImage.createFromPath(join(base, file))
    if (process.platform === 'darwin') img.setTemplateImage(true)
    return img
  }

  create() {
    if (this.tray) return
    this.tray = new Tray(this.icon(false))
    this.tray.on('click', () => this.actions.show())
  }

  update(labels: TrayLabels, state: { recording: boolean; mode: ProcessingMode }) {
    if (!this.tray) return
    this.tray.setImage(this.icon(state.recording))
    this.tray.setToolTip(state.recording ? `${labels.tooltip} — ${labels.recording}` : labels.tooltip)
    const menu = Menu.buildFromTemplate([
      { label: labels.open, click: () => this.actions.show() },
      { type: 'separator' },
      { label: state.recording ? labels.stop : labels.dictate, click: () => this.actions.toggleDictation() },
      { label: labels.pasteLast, click: () => this.actions.pasteLast() },
      {
        label: labels.mode,
        submenu: (['raw', 'correct', 'professional'] as ProcessingMode[]).map((m) => ({
          label: labels.modes[m],
          type: 'radio' as const,
          checked: state.mode === m,
          click: () => this.actions.setMode(m)
        }))
      },
      { type: 'separator' },
      { label: labels.settings, click: () => this.actions.show('settings') },
      { label: labels.quit, click: () => this.actions.quit() }
    ])
    this.tray.setContextMenu(menu)
  }

  destroy() {
    this.tray?.destroy()
    this.tray = null
  }
}
