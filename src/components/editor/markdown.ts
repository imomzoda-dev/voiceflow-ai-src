import TurndownService from 'turndown'

let td: TurndownService | null = null

function service(): TurndownService {
  if (td) return td
  td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
  td.addRule('strike', { filter: ['s', 'del'], replacement: (c) => `~~${c}~~` })
  td.addRule('highlight', { filter: ['mark'], replacement: (c) => `==${c}==` })
  td.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => {
      const rows = Array.from((node as HTMLTableElement).rows).map((r) => Array.from(r.cells).map((c) => (c.textContent ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()))
      if (!rows.length) return ''
      const width = Math.max(...rows.map((r) => r.length))
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')]
      const [head, ...body] = rows.map(pad)
      return `\n\n| ${head.join(' | ')} |\n| ${head.map(() => '---').join(' | ')} |\n${body.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n\n`
    }
  })
  return td
}

export function htmlToMarkdown(html: string): string {
  return service().turndown(html)
}
