/**
 * Document import/export. All file paths come from native dialogs (never from the renderer),
 * imported content is converted to HTML here and sanitised again in the renderer before
 * it reaches the editor.
 */
import { BrowserWindow, dialog } from 'electron'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import mammoth from 'mammoth'
import { marked } from 'marked'
import { tiptapToDocx } from './export/docx-converter'
import type { ExportRequest, ImportedDocument } from '../../shared/types'
import { createLogger } from '../main/logger'

const log = createLogger('files')
const MAX_IMPORT_BYTES = 50 * 1024 * 1024

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || 'Document'
}

const FILTERS: Record<ExportRequest['format'], Electron.FileFilter> = {
  docx: { name: 'Word Document', extensions: ['docx'] },
  pdf: { name: 'PDF', extensions: ['pdf'] },
  md: { name: 'Markdown', extensions: ['md'] },
  txt: { name: 'Plain Text', extensions: ['txt'] },
  html: { name: 'HTML', extensions: ['html'] }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Standalone HTML used for PDF and HTML export. Fonts with full Cyrillic + Tajik coverage. */
export function printableHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  body { font-family: "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", "DejaVu Sans", sans-serif; font-size: 11pt; line-height: 1.55; color: #1b1b1f; }
  h1 { font-size: 22pt; margin: 0 0 10pt; } h2 { font-size: 16pt; margin: 16pt 0 6pt; } h3 { font-size: 13pt; margin: 12pt 0 4pt; }
  p { margin: 0 0 7pt; } ul, ol { margin: 0 0 8pt 18pt; padding: 0; }
  blockquote { margin: 8pt 0; padding: 2pt 10pt; border-left: 3px solid #c9c9d1; color: #555; font-style: italic; }
  pre { background: #f4f4f5; padding: 8pt; border-radius: 4pt; font-family: Consolas, Menlo, monospace; font-size: 9.5pt; white-space: pre-wrap; }
  code { font-family: Consolas, Menlo, monospace; background: #f1f1f3; padding: 0 2pt; border-radius: 2pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; } td, th { border: 1px solid #d4d4d8; padding: 4pt 6pt; vertical-align: top; } th { background: #f1f3f5; text-align: left; }
  img { max-width: 100%; height: auto; } hr { border: none; border-top: 1px solid #ddd; margin: 12pt 0; }
  mark { background: #fff59d; padding: 0 1pt; } a { color: #2457d6; }
  [style*="text-align: center"] { text-align: center; } [style*="text-align: right"] { text-align: right; } [style*="text-align: justify"] { text-align: justify; }
</style></head><body>${bodyHtml}</body></html>`
}

export async function renderPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false }
  })
  try {
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true, generateTaggedPDF: true })
  } finally {
    win.destroy()
  }
}

export class FileService {
  constructor(private readonly parent: () => BrowserWindow | null) {}

  async exportDocument(req: ExportRequest): Promise<{ ok: boolean; path?: string; error?: string; cancelled?: boolean }> {
    const win = this.parent()
    const opts: Electron.SaveDialogOptions = { defaultPath: `${sanitizeFileName(req.title)}.${req.format}`, filters: [FILTERS[req.format]] }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return { ok: false, cancelled: true }
    try {
      let data: Buffer | string
      switch (req.format) {
        case 'docx':
          data = await tiptapToDocx(req.content, req.title)
          break
        case 'pdf':
          data = await renderPdf(printableHtml(req.title, req.html))
          break
        case 'html':
          data = printableHtml(req.title, req.html)
          break
        case 'md':
          data = req.markdown ?? ''
          break
        case 'txt':
          data = req.text ?? ''
          break
      }
      await writeFile(res.filePath, data, typeof data === 'string' ? 'utf8' : undefined)
      log.info(`Exported ${req.format}`)
      return { ok: true, path: res.filePath }
    } catch (e) {
      log.error(`Export ${req.format} failed`, e)
      return { ok: false, error: (e as Error).message }
    }
  }

  async importDocument(): Promise<ImportedDocument | null> {
    const win = this.parent()
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['docx', 'md', 'markdown', 'txt', 'html', 'htm'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    return this.importPath(res.filePaths[0])
  }

  async importPath(path: string): Promise<ImportedDocument> {
    const info = await stat(path)
    if (info.size > MAX_IMPORT_BYTES) throw new Error('File is larger than 50 MB')
    const ext = extname(path).toLowerCase()
    const title = basename(path, extname(path))
    if (ext === '.docx') {
      const r = await mammoth.convertToHtml(
        { path },
        {
          convertImage: mammoth.images.imgElement(async (img) => ({ src: `data:${img.contentType};base64,${await img.readAsBase64String()}` }))
        }
      )
      return { title, html: r.value, format: 'docx', warnings: r.messages.filter((m) => m.type === 'warning').map((m) => m.message).slice(0, 20) }
    }
    const text = await readFile(path, 'utf8')
    if (ext === '.md' || ext === '.markdown') return { title, html: await marked.parse(text, { gfm: true }), format: 'md', warnings: [] }
    if (ext === '.html' || ext === '.htm') {
      const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(text)?.[1] ?? text
      return { title, html: body, format: 'html', warnings: [] }
    }
    const html = text
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('')
    return { title, html, format: 'txt', warnings: [] }
  }

  async pickImage(): Promise<{ dataUrl: string; name: string } | null> {
    const win = this.parent()
    const opts: Electron.OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const p = res.filePaths[0]
    if (res.canceled || !p) return null
    const info = await stat(p)
    if (info.size > 15 * 1024 * 1024) throw new Error('Image is larger than 15 MB')
    const ext = extname(p).slice(1).toLowerCase()
    const mime = ext === 'jpg' ? 'jpeg' : ext
    return { dataUrl: `data:image/${mime};base64,${(await readFile(p)).toString('base64')}`, name: basename(p) }
  }
}
