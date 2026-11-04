/**
 * Tiptap/ProseMirror JSON → DOCX (docx library). Covers headings, paragraphs with alignment,
 * bold/italic/underline/strike/code/highlight/colour/font size/links, nested bullet & numbered
 * lists, blockquotes, code blocks, horizontal rules, tables and embedded PNG/JPEG/GIF images.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild
} from 'docx'
import { imageSize } from './image-size'

interface PMNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]
const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
}
const FONT = 'Calibri'
const MONO = 'Consolas'

function hex(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (m) return m[1].toUpperCase()
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(color)
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
  return undefined
}

function halfPoints(fontSize: unknown): number | undefined {
  if (typeof fontSize !== 'string') return undefined
  const px = /^(\d+(?:\.\d+)?)px$/.exec(fontSize)
  if (px) return Math.round(Number(px[1]) * 0.75 * 2)
  const pt = /^(\d+(?:\.\d+)?)pt$/.exec(fontSize)
  if (pt) return Math.round(Number(pt[1]) * 2)
  return undefined
}

class Converter {
  private numberingRefs = 0
  readonly numberingConfigs: { reference: string; levels: { level: number; format: (typeof LevelFormat)[keyof typeof LevelFormat]; text: string; alignment: (typeof AlignmentType)[keyof typeof AlignmentType]; style: { paragraph: { indent: { left: number; hanging: number } } } }[] }[] = []

  private runs(nodes: PMNode[] | undefined, base: Partial<IRunOptions> = {}): ParagraphChild[] {
    const out: ParagraphChild[] = []
    for (const n of nodes ?? []) {
      if (n.type === 'hardBreak') {
        out.push(new TextRun({ text: '', break: 1 }))
        continue
      }
      if (n.type === 'image') {
        const img = this.image(n)
        if (img) out.push(img)
        continue
      }
      if (n.type !== 'text' || !n.text) continue
      const opts: Record<string, unknown> = { ...base, text: n.text, font: base.font ?? FONT }
      let link: string | null = null
      for (const m of n.marks ?? []) {
        switch (m.type) {
          case 'bold':
            opts.bold = true
            break
          case 'italic':
            opts.italics = true
            break
          case 'underline':
            opts.underline = {}
            break
          case 'strike':
            opts.strike = true
            break
          case 'code':
            opts.font = MONO
            opts.shading = { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' }
            break
          case 'highlight': {
            const c = hex(m.attrs?.color) ?? 'FFF59D'
            opts.shading = { type: ShadingType.CLEAR, fill: c, color: 'auto' }
            break
          }
          case 'textStyle': {
            const c = hex(m.attrs?.color)
            if (c) opts.color = c
            const size = halfPoints(m.attrs?.fontSize)
            if (size) opts.size = size
            break
          }
          case 'link':
            if (typeof m.attrs?.href === 'string' && /^(https?:|mailto:)/i.test(m.attrs.href)) link = m.attrs.href
            break
        }
      }
      if (link) {
        out.push(new ExternalHyperlink({ link, children: [new TextRun({ ...(opts as IRunOptions), style: 'Hyperlink' })] }))
      } else {
        out.push(new TextRun(opts as IRunOptions))
      }
    }
    return out
  }

  private image(n: PMNode): ImageRun | null {
    const src = typeof n.attrs?.src === 'string' ? n.attrs.src : ''
    const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(src)
    if (!m) return null
    const data = Buffer.from(m[2], 'base64')
    const type = (m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()) as 'png' | 'jpg' | 'gif' | 'bmp'
    const size = imageSize(data) ?? { width: 600, height: 400 }
    const maxW = 600
    const w = Math.min(maxW, Number(n.attrs?.width) || size.width)
    const h = Math.round((w / size.width) * size.height)
    return new ImageRun({ type, data, transformation: { width: w, height: h } })
  }

  private paragraph(n: PMNode, extra: Record<string, unknown> = {}): Paragraph {
    const align = ALIGN[String(n.attrs?.textAlign ?? '')]
    return new Paragraph({ children: this.runs(n.content), alignment: align, spacing: { after: 120 }, ...extra })
  }

  private newNumbering(ordered: boolean): string {
    const reference = `list-${this.numberingRefs++}`
    this.numberingConfigs.push({
      reference,
      levels: Array.from({ length: 6 }, (_, level) => ({
        level,
        format: ordered ? [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3] : LevelFormat.BULLET,
        text: ordered ? `%${level + 1}.` : ['•', '◦', '▪'][level % 3],
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } }
      }))
    })
    return reference
  }

  private list(n: PMNode, level: number, reference: string | null): (Paragraph | Table)[] {
    const ordered = n.type === 'orderedList'
    const ref = reference ?? this.newNumbering(ordered)
    const out: (Paragraph | Table)[] = []
    for (const item of n.content ?? []) {
      for (const child of item.content ?? []) {
        if (child.type === 'bulletList' || child.type === 'orderedList') {
          out.push(...this.list(child, level + 1, child.type === n.type ? ref : null))
        } else if (child.type === 'paragraph') {
          out.push(this.paragraph(child, { numbering: { reference: ref, level: Math.min(level, 5) } }))
        } else {
          out.push(...this.block(child))
        }
      }
    }
    return out
  }

  private table(n: PMNode): Table {
    const rows = (n.content ?? []).map(
      (row) =>
        new TableRow({
          tableHeader: (row.content ?? []).every((c) => c.type === 'tableHeader'),
          children: (row.content ?? []).map(
            (c) =>
              new TableCell({
                columnSpan: Number(c.attrs?.colspan) || 1,
                rowSpan: Number(c.attrs?.rowspan) || 1,
                shading: c.type === 'tableHeader' ? { type: ShadingType.CLEAR, fill: 'F1F3F5', color: 'auto' } : undefined,
                children: (c.content ?? []).flatMap((b) => this.block(b, c.type === 'tableHeader')).filter((b): b is Paragraph => b instanceof Paragraph).concat([]) as Paragraph[]
              })
          )
        })
    )
    return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
  }

  block(n: PMNode, bold = false): (Paragraph | Table)[] {
    switch (n.type) {
      case 'paragraph':
        return [bold ? new Paragraph({ children: this.runs(n.content, { bold: true }) }) : this.paragraph(n)]
      case 'heading': {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1))
        return [new Paragraph({ heading: HEADINGS[level - 1], alignment: ALIGN[String(n.attrs?.textAlign ?? '')], children: this.runs(n.content) })]
      }
      case 'bulletList':
      case 'orderedList':
        return this.list(n, 0, null)
      case 'blockquote':
        return (n.content ?? []).flatMap((c) =>
          c.type === 'paragraph'
            ? [new Paragraph({ children: this.runs(c.content, { italics: true, color: '555555' }), indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BBBBBB', space: 8 } } })]
            : this.block(c)
        )
      case 'codeBlock': {
        const text = (n.content ?? []).map((c) => c.text ?? '').join('')
        const lines = text.split('\n')
        return [
          new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: 'F4F4F5', color: 'auto' },
            children: lines.map((l, i) => new TextRun({ text: l, font: MONO, size: 20, break: i > 0 ? 1 : undefined }))
          })
        ]
      }
      case 'horizontalRule':
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } }, children: [] })]
      case 'table':
        return [this.table(n), new Paragraph({ children: [] })]
      case 'image': {
        const img = this.image(n)
        return img ? [new Paragraph({ children: [img] })] : []
      }
      default:
        return n.content ? n.content.flatMap((c) => this.block(c)) : []
    }
  }
}

export async function tiptapToDocx(doc: unknown, title: string): Promise<Buffer> {
  const root = doc as PMNode
  const c = new Converter()
  const children = (root.content ?? []).flatMap((n) => c.block(n))
  const document = new Document({
    title,
    creator: 'VoiceFlow AI',
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering: { config: c.numberingConfigs },
    sections: [{ properties: {}, children: children.length ? children : [new Paragraph({ children: [] })] }]
  })
  return Packer.toBuffer(document)
}
