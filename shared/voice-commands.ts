/**
 * Voice command recognition for the built-in editor.
 *
 * To avoid eating real dictation, a command is only recognised when the WHOLE utterance
 * (after trimming punctuation/case) equals one of the command phrases. "Новый абзац" alone
 * is a command; "я начал новый абзац в книге" is ordinary text.
 */

export type EditorCommand =
  | 'newParagraph'
  | 'newLine'
  | 'heading'
  | 'orderedList'
  | 'bulletList'
  | 'deleteLastSentence'
  | 'undo'
  | 'redo'
  | 'save'
  | 'selectLastParagraph'
  | 'bold'
  | 'italic'
  | 'underline'

export type AiCommand =
  | 'fixLastParagraph'
  | 'rewriteProfessional'
  | 'shorten'
  | 'expand'
  | 'translateEn'
  | 'translateRu'
  | 'translateTg'
  | 'summarize'

export type VoiceCommand = { kind: 'editor'; command: EditorCommand } | { kind: 'ai'; command: AiCommand }

const EDITOR_PHRASES: Record<EditorCommand, string[]> = {
  newParagraph: ['new paragraph', 'новый абзац', 'абзаци нав', 'сархати нав'],
  newLine: ['new line', 'новая строка', 'с новой строки', 'сатри нав'],
  heading: ['new heading', 'heading', 'новый заголовок', 'заголовок', 'сарлавҳаи нав', 'сарлавҳа'],
  orderedList: ['numbered list', 'нумерованный список', 'создать нумерованный список', 'рӯйхати рақамдор'],
  bulletList: ['bullet list', 'bulleted list', 'маркированный список', 'создать маркированный список', 'рӯйхати нуқтадор'],
  deleteLastSentence: ['delete last sentence', 'удалить последнее предложение', 'удали последнее предложение', 'ҷумлаи охиринро нест кун'],
  undo: ['undo', 'undo that', 'отменить', 'отмени', 'отменить последнее действие', 'бекор кун'],
  redo: ['redo', 'повторить', 'повтори', 'повторить действие', 'такрор кун'],
  save: ['save document', 'save', 'сохранить документ', 'сохрани документ', 'сохранить', 'ҳуҷҷатро нигоҳ дор', 'нигоҳ дор'],
  selectLastParagraph: ['select last paragraph', 'выделить последний абзац', 'выдели последний абзац', 'абзаци охиринро интихоб кун'],
  bold: ['bold', 'жирный', 'жирный текст', 'ғафс'],
  italic: ['italic', 'курсив', 'хами'],
  underline: ['underline', 'подчёркивание', 'подчеркивание', 'подчеркнуть', 'хат зер']
}

const AI_PHRASES: Record<AiCommand, string[]> = {
  fixLastParagraph: ['fix last paragraph', 'correct last paragraph', 'исправь последний абзац', 'исправить последний абзац', 'абзаци охиринро ислоҳ кун'],
  rewriteProfessional: ['rewrite professionally', 'make it professional', 'перепиши профессионально', 'касбӣ нависта деҳ', 'касбӣ аз нав навис'],
  shorten: ['shorten text', 'make it shorter', 'сократи текст', 'сократи', 'матнро кӯтоҳ кун'],
  expand: ['expand text', 'make it longer', 'расширь текст', 'расширь', 'матнро васеъ кун'],
  translateEn: ['translate to english', 'переведи на английский', 'ба англисӣ тарҷума кун'],
  translateRu: ['translate to russian', 'переведи на русский', 'ба русӣ тарҷума кун'],
  translateTg: ['translate to tajik', 'переведи на таджикский', 'ба тоҷикӣ тарҷума кун'],
  summarize: ['summarize', 'make a summary', 'сделай краткое содержание', 'краткое содержание', 'хулоса кун', 'мухтасар кун']
}

export function normalizeUtterance(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const lookup = new Map<string, VoiceCommand>()
for (const [cmd, phrases] of Object.entries(EDITOR_PHRASES)) {
  for (const p of phrases) lookup.set(normalizeUtterance(p), { kind: 'editor', command: cmd as EditorCommand })
}
for (const [cmd, phrases] of Object.entries(AI_PHRASES)) {
  for (const p of phrases) lookup.set(normalizeUtterance(p), { kind: 'ai', command: cmd as AiCommand })
}

export function parseVoiceCommand(utterance: string): VoiceCommand | null {
  const n = normalizeUtterance(utterance)
  if (!n || n.split(' ').length > 7) return null
  return lookup.get(n) ?? null
}

export function commandPhrases(): { editor: Record<EditorCommand, string[]>; ai: Record<AiCommand, string[]> } {
  return { editor: EDITOR_PHRASES, ai: AI_PHRASES }
}
