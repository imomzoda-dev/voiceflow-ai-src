import type { Editor } from '@tiptap/core'
import type { EditorCommand } from '@shared/voice-commands'

/**
 * Inserts dictated text at the caret as plain text nodes (never parsed as HTML), adding a
 * separating space when needed and turning blank lines into paragraphs.
 */
export function insertDictation(editor: Editor, text: string) {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return
  const { state } = editor
  const { from, empty } = state.selection
  const $from = state.doc.resolve(from)
  const before = empty && $from.parentOffset > 0 ? state.doc.textBetween(from - 1, from, '\n', '￼') : ''
  const needsSpace = before !== '' && !/\s/.test(before) && !/^[\s.,;:!?…)»"'’]/.test(clean)
  const paragraphs = clean.split(/\n{2,}/)
  let chain = editor.chain().focus()
  paragraphs.forEach((para, i) => {
    if (i > 0) chain = chain.splitBlock()
    const lines = para.split('\n')
    lines.forEach((line, j) => {
      if (j > 0) chain = chain.setHardBreak()
      const value = i === 0 && j === 0 && needsSpace ? ` ${line}` : line
      if (value) chain = chain.insertContent({ type: 'text', text: value })
    })
  })
  chain.run()
}

function deleteLastSentence(editor: Editor): boolean {
  const { state } = editor
  const { $from } = state.selection
  const blockStart = $from.start()
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
  if (!textBefore.trim()) {
    // Empty paragraph: remove it (moves into the previous block).
    return editor.chain().focus().joinBackward().run()
  }
  const s = textBefore.replace(/\s+$/, '')
  const body = s.replace(/[.!?…]+$/u, '')
  const boundary = Math.max(...['. ', '! ', '? ', '… ', '. '].map((b) => body.lastIndexOf(b)))
  const keep = boundary >= 0 ? boundary + 1 : 0
  return editor
    .chain()
    .focus()
    .deleteRange({ from: blockStart + keep, to: $from.pos })
    .run()
}

/** Finds the last non-empty textblock (paragraph/heading) and returns its inner range. */
export function lastParagraphRange(editor: Editor): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent.trim()) found = { from: pos + 1, to: pos + node.nodeSize - 1 }
  })
  return found
}

/** Current paragraph around the caret. */
export function currentParagraphRange(editor: Editor): { from: number; to: number } {
  const { $from } = editor.state.selection
  return { from: $from.start(), to: $from.end() }
}

export function runEditorCommand(editor: Editor, cmd: EditorCommand, onSave: () => void): boolean {
  const c = editor.chain().focus()
  switch (cmd) {
    case 'newParagraph':
      return c.splitBlock().run()
    case 'newLine':
      return c.setHardBreak().run()
    case 'heading':
      return c.toggleHeading({ level: 2 }).run()
    case 'orderedList':
      return c.toggleOrderedList().run()
    case 'bulletList':
      return c.toggleBulletList().run()
    case 'deleteLastSentence':
      return deleteLastSentence(editor)
    case 'undo':
      return c.undo().run()
    case 'redo':
      return c.redo().run()
    case 'save':
      onSave()
      return true
    case 'selectLastParagraph': {
      const r = lastParagraphRange(editor)
      return r ? c.setTextSelection(r).run() : false
    }
    case 'bold':
      return c.toggleBold().run()
    case 'italic':
      return c.toggleItalic().run()
    case 'underline':
      return c.toggleUnderline().run()
  }
}

/** Replaces [from, to] with plain text (paragraph breaks preserved), as one undoable step. */
export function replaceRangeWithText(editor: Editor, range: { from: number; to: number }, text: string) {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/)
  const content = paragraphs.length === 1 ? paragraphs[0].split('\n').flatMap((l, i) => (i ? [{ type: 'hardBreak' }, ...(l ? [{ type: 'text', text: l }] : [])] : l ? [{ type: 'text', text: l }] : [])) : paragraphs.map((p) => ({ type: 'paragraph', content: p ? [{ type: 'text', text: p }] : [] }))
  editor.chain().focus().insertContentAt(range, content).run()
}

/** Inserts paragraphs after the block that contains `pos`. */
export function insertParagraphsAfter(editor: Editor, pos: number, text: string) {
  const $pos = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size))
  const after = $pos.depth > 0 ? $pos.after(1) : editor.state.doc.content.size
  const nodes = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => ({ type: 'paragraph', content: p.trim() ? [{ type: 'text', text: p.trim() }] : [] }))
  editor.chain().focus().insertContentAt(after, nodes).run()
}
