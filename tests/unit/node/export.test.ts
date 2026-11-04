import { describe, it, expect } from 'vitest'
import mammoth from 'mammoth'
import { tiptapToDocx } from '../../../electron/services/export/docx-converter'
import { encodeWav, resample, stats, trimSilence } from '../../../shared/audio'

const TAJIK = 'Ё Ғ Қ Ӯ Ҳ Ҷ Ӣ — ё ғ қ ӯ ҳ ҷ ӣ'

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Ҳисоботи моҳона' }] },
    { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: TAJIK, marks: [{ type: 'bold' }] }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Банди якум' }] }] }] },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ном' }] }] }, { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Қимат' }] }] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ҷамъ' }] }] }, { type: 'tableCell', content: [{ type: 'paragraph' }] }] }
      ]
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'Сайт', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] }
  ]
}

describe('DOCX export', () => {
  it('produces a valid .docx that round-trips Tajik letters, headings, lists and tables', async () => {
    const buf = await tiptapToDocx(doc, 'Test')
    expect(buf.subarray(0, 2).toString()).toBe('PK') // zip container
    const html = (await mammoth.convertToHtml({ buffer: buf })).value
    expect(html).toContain('<h1>Ҳисоботи моҳона</h1>')
    expect(html).toContain(TAJIK)
    expect(html).toContain('<table>')
    expect(html).toContain('Ҷамъ')
    expect(html).toContain('<li>Банди якум</li>')
    expect(html).toContain('href="https://example.com"')
  })
  it('handles an empty document', async () => {
    const buf = await tiptapToDocx({ type: 'doc', content: [] }, 'Empty')
    expect(buf.length).toBeGreaterThan(1000)
  })
})

describe('audio pipeline', () => {
  it('resamples 48 kHz → 16 kHz and encodes a valid PCM16 WAV', () => {
    const input = new Float32Array(48000).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.5)
    const out = resample(input, 48000, 16000)
    expect(out.length).toBe(16000)
    const wav = Buffer.from(encodeWav(out, 16000))
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.readUInt32LE(24)).toBe(16000)
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.length).toBe(44 + 16000 * 2)
    expect(stats(out).peak).toBeGreaterThan(0.45)
  })
  it('trims leading/trailing silence', () => {
    const s = new Float32Array(16000 * 3)
    for (let i = 16000; i < 32000; i++) s[i] = Math.sin(i / 5) * 0.3
    const trimmed = trimSilence(s)
    expect(trimmed.length).toBeLessThan(s.length * 0.6)
    expect(trimmed.length).toBeGreaterThan(16000)
  })
})
