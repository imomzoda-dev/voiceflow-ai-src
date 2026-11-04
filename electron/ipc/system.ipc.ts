import { app, dialog, shell } from 'electron'
import { writeFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { handle, zId } from './guard'
import { hotkeyBindingSchema } from '../../shared/settings'
import { permissionStatus, requestPermission, openPermissionSettings } from '../main/permissions-manager'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import type { AppContext } from '../main/app-context'
import type { DictationRecord } from '../../shared/types'

const permissionKind = z.enum(['microphone', 'accessibility', 'input-monitoring'])
const SAFE_EXTERNAL = /^https:\/\/[^\s]+$/i

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function historyExport(items: DictationRecord[], format: 'json' | 'csv' | 'txt'): string {
  if (format === 'json') return JSON.stringify(items, null, 2)
  if (format === 'csv') {
    const cols: (keyof DictationRecord)[] = ['startedAt', 'durationMs', 'language', 'speechProvider', 'mode', 'status', 'originalText', 'correctedText', 'finalText']
    return [cols.join(','), ...items.map((i) => cols.map((c) => csvCell(c === 'startedAt' ? new Date(i.startedAt).toISOString() : i[c])).join(','))].join('\r\n')
  }
  return items.map((i) => `[${new Date(i.startedAt).toLocaleString()}] (${i.language ?? '?'})\n${i.finalText}\n`).join('\n')
}

export function registerSystemIpc(ctx: AppContext) {
  handle('system:info', z.tuple([]), () => ({
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    userData: ctx.paths.userData,
    logsDir: ctx.paths.logs,
    isPackaged: app.isPackaged
  }))
  handle('system:permissions', z.tuple([]), () => permissionStatus())
  handle('system:requestPermission', z.tuple([permissionKind]), async (_e, k) => {
    const r = await requestPermission(k)
    // After macOS grants Accessibility the event tap may need a restart.
    if (k === 'accessibility' && r === 'granted' && !ctx.bridge.isRunning()) ctx.hotkeys.start()
    return r
  })
  handle('system:openPermissionSettings', z.tuple([permissionKind]), (_e, k) => openPermissionSettings(k))
  handle('system:openLogs', z.tuple([]), async () => {
    await shell.openPath(ctx.paths.logs)
  })
  handle('system:openExternal', z.tuple([z.string().max(2048)]), async (_e, url) => {
    if (!SAFE_EXTERNAL.test(url)) return false
    await shell.openExternal(url)
    return true
  })
  handle('system:showMainWindow', z.tuple([z.string().max(64).optional()]), (_e, page) => ctx.showMain(page))
  handle('updates:get', z.tuple([]), () => ctx.updater.get())
  handle('updates:check', z.tuple([]), () => ctx.updater.check())
  handle('updates:download', z.tuple([]), () => ctx.updater.download())
  handle('updates:cancel', z.tuple([]), () => ctx.updater.cancelDownload())
  handle('updates:install', z.tuple([]), () => ctx.updater.install(async () => undefined))
  handle('updates:notes', z.tuple([z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/)]), (_e, v) => ctx.updater.releaseNotes(v))
  handle('system:stats', z.tuple([]), async () => ctx.dictations.stats(await ctx.documents.count()))
  handle('system:clearAllData', z.tuple([]), async () => {
    const win = ctx.mainWindow
    const opts: Electron.MessageBoxOptions = { type: 'warning', buttons: [ctx.str('cancel'), ctx.str('deleteAll')], defaultId: 0, cancelId: 0, message: ctx.str('clearConfirm') }
    const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    if (r.response !== 1) return
    const raw = ctx.h.raw
    for (const t of ['document_versions', 'documents', 'document_folders', 'dictations', 'personal_dictionary', 'ai_providers', 'backup_history', 'app_settings']) raw.exec(`DELETE FROM ${t}`)
    raw.exec("DELETE FROM templates WHERE is_builtin = 0")
    ctx.secrets.clear()
    for (const f of await readdir(ctx.paths.audio).catch(() => [] as string[])) await rm(join(ctx.paths.audio, f), { force: true })
    await ctx.settings.replaceAll(DEFAULT_SETTINGS)
  })

  handle('hotkeys:status', z.tuple([]), () => ctx.hotkeys.status())
  handle('hotkeys:suspend', z.tuple([z.boolean()]), (_e, s) => ctx.hotkeys.suspend(s, ctx.settings.get()))
  handle('hotkeys:checkBinding', z.tuple([hotkeyBindingSchema]), (_e, b) => ctx.hotkeys.checkBinding(b))

  /* history */
  const historyQuery = z
    .object({
      search: z.string().max(500).optional(),
      language: z.string().max(8).nullable().optional(),
      status: z.enum(['success', 'error', 'cancelled', 'command']).nullable().optional(),
      from: z.number().nullable().optional(),
      to: z.number().nullable().optional(),
      limit: z.number().int().min(1).max(1000).optional(),
      offset: z.number().int().min(0).optional()
    })
    .optional()
  handle('history:list', z.tuple([historyQuery]), (_e, q) => ctx.dictations.list(q ?? {}))
  handle('history:remove', z.tuple([zId]), async (_e, id) => {
    const audio = await ctx.dictations.remove(id)
    if (audio) await rm(audio, { force: true })
  })
  handle('history:clear', z.tuple([]), async () => {
    const r = await ctx.dictations.clear()
    for (const p of r.audioPaths) await rm(p, { force: true })
    return r.count
  })
  handle('history:deleteAudio', z.tuple([]), async () => {
    const all = await ctx.dictations.audioPaths()
    for (const a of all) await rm(a.audioPath, { force: true })
    await ctx.dictations.clearAudioRefs(all.map((a) => a.id))
    return all.length
  })
  handle('history:export', z.tuple([z.enum(['json', 'csv', 'txt'])]), async (_e, format) => {
    const opts: Electron.SaveDialogOptions = { defaultPath: `voiceflow-history.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] }
    const r = ctx.mainWindow ? await dialog.showSaveDialog(ctx.mainWindow, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return { ok: false, cancelled: true }
    const content = historyExport(await ctx.dictations.all(), format)
    await writeFile(r.filePath, format === 'csv' ? `﻿${content}` : content, 'utf8')
    return { ok: true, path: r.filePath }
  })

  /* backup */
  handle('backup:list', z.tuple([]), () => ctx.backupsRepo.list())
  handle('backup:chooseDirectory', z.tuple([]), async () => {
    const opts: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const r = ctx.mainWindow ? await dialog.showOpenDialog(ctx.mainWindow, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0]) return null
    await ctx.settings.update('backup', { directory: r.filePaths[0] })
    return r.filePaths[0]
  })
  handle('backup:create', z.tuple([]), async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const dir = ctx.settings.get().backup.directory ?? ctx.paths.backups
    const opts: Electron.SaveDialogOptions = { title: ctx.str('exportBackup'), defaultPath: join(dir, `voiceflow-backup-${stamp}.vfbackup`), filters: [{ name: 'VoiceFlow backup', extensions: ['vfbackup'] }] }
    const r = ctx.mainWindow ? await dialog.showSaveDialog(ctx.mainWindow, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return { ok: false, cancelled: true }
    const info = await ctx.backup.createAt(r.filePath, 'manual')
    return info.status === 'ok' ? { ok: true, path: info.path } : { ok: false, error: info.message ?? 'Backup failed' }
  })
  handle('backup:restore', z.tuple([]), async () => {
    const opts: Electron.OpenDialogOptions = { title: ctx.str('restoreBackup'), properties: ['openFile'], filters: [{ name: 'VoiceFlow backup', extensions: ['vfbackup'] }] }
    const r = ctx.mainWindow ? await dialog.showOpenDialog(ctx.mainWindow, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0]) return { ok: false, cancelled: true }
    const confirmOpts: Electron.MessageBoxOptions = { type: 'question', buttons: [ctx.str('cancel'), ctx.str('restore')], defaultId: 1, cancelId: 0, message: ctx.str('restoreConfirm') }
    const c = ctx.mainWindow ? await dialog.showMessageBox(ctx.mainWindow, confirmOpts) : await dialog.showMessageBox(confirmOpts)
    if (c.response !== 1) return { ok: false, cancelled: true }
    try {
      const counts = await ctx.backup.restoreFrom(r.filePaths[0])
      await ctx.settings.load()
      ctx.broadcast('evt:settings', ctx.settings.get())
      ctx.hotkeys.apply(ctx.settings.get())
      return { ok: true, counts }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
  handle('backup:exportSettings', z.tuple([]), async () => {
    const opts: Electron.SaveDialogOptions = { defaultPath: 'voiceflow-settings.json', filters: [{ name: 'JSON', extensions: ['json'] }] }
    const r = ctx.mainWindow ? await dialog.showSaveDialog(ctx.mainWindow, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return { ok: false, cancelled: true }
    await writeFile(r.filePath, JSON.stringify(ctx.settings.get(), null, 2), 'utf8')
    return { ok: true, path: r.filePath }
  })
}
