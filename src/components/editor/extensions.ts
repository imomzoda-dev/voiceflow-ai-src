import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import { Placeholder, CharacterCount } from '@tiptap/extensions'
import { generateJSON, generateHTML, type Extensions } from '@tiptap/core'
import DOMPurify from 'dompurify'

const SAFE_PROTOCOLS = ['http', 'https', 'mailto']

export function baseExtensions(placeholder?: string): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        protocols: SAFE_PROTOCOLS,
        isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && /^(https?:|mailto:)/i.test(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' }
      }
    }),
    TextStyle,
    Color,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({ allowBase64: true, inline: false }),
    CharacterCount,
    ...(placeholder !== undefined ? [Placeholder.configure({ placeholder })] : [])
  ]
}

const headless = baseExtensions()

/** Imported/AI HTML is untrusted: sanitise before it becomes editor content. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'srcset'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|data:image\/(?:png|jpe?g|gif|webp);base64,|#)/i
  })
}

export function htmlToDoc(html: string): unknown {
  return generateJSON(sanitizeHtml(html), headless)
}

export function docToHtml(doc: unknown): string {
  return generateHTML(doc as Parameters<typeof generateHTML>[0], headless)
}
