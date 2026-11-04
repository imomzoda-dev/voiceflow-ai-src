// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { baseExtensions, htmlToDoc, sanitizeHtml } from '../../../src/components/editor/extensions'
import { insertDictation, runEditorCommand, lastParagraphRange } from '../../../src/components/editor/editor-commands'
import { htmlToMarkdown } from '../../../src/components/editor/markdown'

let editor: Editor | null = null
const make = (html = '<p></p>') => (editor = new Editor({ extensions: baseExtensions(), content: html }))
afterEach(() => editor?.destroy())

describe('dictation into the editor', () => {
  it('inserts plain text with a separating space and never parses HTML', () => {
    const e = make('<p>Салом</p>')
    e.commands.focus('end')
    insertDictation(e, '<b>дунё</b>')
    expect(e.getText()).toBe('Салом <b>дунё</b>')
    expect(e.getHTML()).not.toContain('<strong>')
  })
  it('splits blank-line separated dictation into paragraphs', () => {
    const e = make()
    e.commands.focus('end')
    insertDictation(e, 'Якум.\n\nДуюм.')
    expect(e.getJSON().content?.filter((n) => n.type === 'paragraph')).toHaveLength(2)
  })
  it('does not add a space before punctuation', () => {
    const e = make('<p>Ҳа</p>')
    e.commands.focus('end')
    insertDictation(e, ', албатта')
    expect(e.getText()).toBe('Ҳа, албатта')
  })
})

describe('voice commands', () => {
  it('deletes the last sentence', () => {
    const e = make('<p>Первое предложение. Второе предложение.</p>')
    e.commands.focus('end')
    runEditorCommand(e, 'deleteLastSentence', () => {})
    expect(e.getText()).toBe('Первое предложение.')
  })
  it('new paragraph, heading, lists, undo and save callback', () => {
    const e = make('<p>Матн</p>')
    e.commands.focus('end')
    runEditorCommand(e, 'heading', () => {})
    expect(e.isActive('heading', { level: 2 })).toBe(true)
    runEditorCommand(e, 'newParagraph', () => {})
    runEditorCommand(e, 'bulletList', () => {})
    expect(e.isActive('bulletList')).toBe(true)
    let saved = false
    runEditorCommand(e, 'save', () => (saved = true))
    expect(saved).toBe(true)
  })
  it('finds the last non-empty paragraph', () => {
    const e = make('<p>Аввал</p><p>Охир</p><p></p>')
    const r = lastParagraphRange(e)!
    expect(e.state.doc.textBetween(r.from, r.to)).toBe('Охир')
  })
})

describe('import sanitising', () => {
  it('removes scripts and event handlers from imported HTML', () => {
    const clean = sanitizeHtml('<p onclick="x()">Hi<script>alert(1)</script><img src="javascript:alert(1)"></p>')
    expect(clean).not.toMatch(/script|onclick|javascript:/)
    const json = htmlToDoc('<h2>Сарлавҳа</h2><table><tr><th>A</th></tr><tr><td>Ҷ</td></tr></table>') as { content: { type: string }[] }
    expect(json.content.map((n) => n.type)).toEqual(['heading', 'table'])
  })
  it('exports Markdown with GFM tables', () => {
    const md = htmlToMarkdown('<h1>Ном</h1><p><strong>Ғафс</strong></p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>')
    expect(md).toContain('# Ном')
    expect(md).toContain('**Ғафс**')
    expect(md).toContain('| A | B |')
  })
})
