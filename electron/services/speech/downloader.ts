/**
 * Streaming HTTPS downloader with progress, cancellation, SHA-256 verification and
 * atomic rename (`.part` → final). TLS verification is always on (Node defaults).
 */
import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

export interface DownloadOptions {
  url: string
  dest: string
  signal: AbortSignal
  expectedSha256?: string | null
  expectedSize?: number | null
  onProgress?: (received: number, total: number | null) => void
  fetchImpl?: typeof fetch
}

export interface DownloadResult {
  sha256: string
  size: number
  verified: boolean
}

/**
 * Hugging Face publishes the LFS object's SHA-256 in `x-linked-etag` on the (pre-redirect)
 * resolve response. We read it with a manual-redirect HEAD so verification uses the source's
 * own checksum rather than a hard-coded table.
 */
export async function fetchHuggingFaceChecksum(url: string, fetchImpl: typeof fetch = fetch): Promise<{ sha256: string | null; size: number | null }> {
  try {
    const res = await fetchImpl(url, { method: 'HEAD', redirect: 'manual' })
    const etag = res.headers.get('x-linked-etag') ?? res.headers.get('etag')
    const size = Number(res.headers.get('x-linked-size') ?? '') || null
    const sha = etag?.replace(/^W\//, '').replace(/"/g, '').trim() ?? null
    return { sha256: sha && /^[a-f0-9]{64}$/i.test(sha) ? sha.toLowerCase() : null, size }
  } catch {
    return { sha256: null, size: null }
  }
}

export async function downloadFile(o: DownloadOptions): Promise<DownloadResult> {
  const f = o.fetchImpl ?? fetch
  const res = await f(o.url, { signal: o.signal, redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length') ?? '') || o.expectedSize || null
  const part = `${o.dest}.part`
  const hash = createHash('sha256')
  let received = 0
  let lastEmit = 0
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk)
      received += chunk.length
      const now = Date.now()
      if (now - lastEmit > 150) {
        lastEmit = now
        o.onProgress?.(received, total)
      }
      cb(null, chunk)
    }
  })
  try {
    await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), meter, createWriteStream(part), { signal: o.signal })
  } catch (e) {
    await rm(part, { force: true }).catch(() => undefined)
    throw e
  }
  o.onProgress?.(received, total)
  const sha256 = hash.digest('hex')
  if (o.expectedSize && received !== o.expectedSize) {
    await rm(part, { force: true })
    throw new Error(`Size mismatch (expected ${o.expectedSize}, got ${received})`)
  }
  if (o.expectedSha256 && sha256 !== o.expectedSha256.toLowerCase()) {
    await rm(part, { force: true })
    throw new Error('Checksum mismatch: the downloaded file is corrupt or was tampered with')
  }
  await rename(part, o.dest)
  return { sha256, size: received, verified: Boolean(o.expectedSha256) }
}
