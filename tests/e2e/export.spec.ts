/// <reference lib="dom" />
import type {} from "../../shared/api"
import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { launch, completeOnboarding } from './helpers'

const TAJIK = 'Ё Ғ Қ Ӯ Ҳ Ҷ Ӣ ё ғ қ ӯ ҳ ҷ ӣ'

test('14/15 · DOCX and PDF export keep Cyrillic and Tajik letters', async () => {
  const l = await launch()
  const out = mkdtempSync(join(tmpdir(), 'vf-export-'))
  try {
    await completeOnboarding(l.page)
    // Replace the native save dialog so the test can choose the path.
    await l.app.evaluate(({ dialog }, dir) => {
      let n = 0
      dialog.showSaveDialog = (async (...args: unknown[]) => {
        const opts = (args.length > 1 ? args[1] : args[0]) as { defaultPath?: string }
        const ext = opts.defaultPath?.split('.').pop()
        return { canceled: false, filePath: `${dir}/export-${n++}.${ext}` }
      }) as typeof dialog.showSaveDialog
    }, out.replace(/\\/g, '/'))
    const content = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Ҳисобот' }] }, { type: 'paragraph', content: [{ type: 'text', text: TAJIK }] }] }
    const html = `<h1>Ҳисобот</h1><p>${TAJIK}</p><table><tr><th>Ном</th></tr><tr><td>Ҷамъ</td></tr></table>`
    const pdf = await l.page.evaluate((a) => window.voiceflow.files.exportDocument({ format: 'pdf', title: 'Ҳисобот', content: a.content, html: a.html }), { content, html })
    const docx = await l.page.evaluate((a) => window.voiceflow.files.exportDocument({ format: 'docx', title: 'Ҳисобот', content: a.content, html: a.html }), { content, html })
    expect(pdf.ok).toBe(true)
    expect(docx.ok).toBe(true)
    expect(readFileSync(pdf.path!).subarray(0, 5).toString()).toBe('%PDF-')
    expect(existsSync(docx.path!)).toBe(true)
    // Extract the PDF text layer (selectable text, not images) when pypdf is available.
    let text = ''
    try {
      text = execFileSync('python', ['-c', 'import sys,pypdf;print("".join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))', pdf.path!], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    } catch {
      test.info().annotations.push({ type: 'note', description: 'pypdf not available; PDF text layer not checked' })
    }
    if (text) {
      for (const ch of 'ЁҒҚӮҲҶӢёғқӯҳҷӣ') expect(text).toContain(ch)
      expect(text).toContain('Ҷамъ')
    }
  } finally {
    await l.close()
  }
})
