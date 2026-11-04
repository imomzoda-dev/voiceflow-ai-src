/**
 * Word-level diff (LCS) for "original vs corrected" comparisons. Whitespace is kept as part
 * of tokens so the output can be re-rendered faithfully. For very long inputs the DP table
 * would be too large; we then fall back to a coarse prefix/suffix diff.
 */
export interface DiffPart {
  type: 'same' | 'added' | 'removed'
  text: string
}

function tokenize(s: string): string[] {
  return s.match(/\s+|[\p{L}\p{N}'’ʻ-]+|[^\s\p{L}\p{N}]/gu) ?? []
}

export function diffWords(a: string, b: string, maxCells = 4_000_000): DiffPart[] {
  const x = tokenize(a)
  const y = tokenize(b)
  if (x.length * y.length > maxCells) return coarse(a, b)
  const n = x.length
  const m = y.length
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  }
  const out: DiffPart[] = []
  const push = (type: DiffPart['type'], text: string) => {
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += text
    else out.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push('same', x[i])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('removed', x[i++])
    else push('added', y[j++])
  }
  while (i < n) push('removed', x[i++])
  while (j < m) push('added', y[j++])
  return out
}

function coarse(a: string, b: string): DiffPart[] {
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
  const parts: DiffPart[] = []
  if (p) parts.push({ type: 'same', text: a.slice(0, p) })
  if (a.length - s > p) parts.push({ type: 'removed', text: a.slice(p, a.length - s) })
  if (b.length - s > p) parts.push({ type: 'added', text: b.slice(p, b.length - s) })
  if (s) parts.push({ type: 'same', text: a.slice(a.length - s) })
  return parts
}
