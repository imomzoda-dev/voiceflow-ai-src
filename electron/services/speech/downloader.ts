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

/** Attempts after a dropped connection or a stall; each resumes from the bytes already received. */
const MAX_ATTEMPTS = 10
/** No data for this long counts as a stalled connection. */
const STALL_MS = 30_000

/**
 * Downloads to `<dest>.part`, then verifies and renames. A dropped or stalled connection (common
 * with large models on slow networks) does not restart the download: it resumes with an HTTP
 * Range request from the bytes already written, hashing the stream in order across attempts.
 */
export async function downloadFile(o: DownloadOptions): Promise<DownloadResult> {
  const f = o.fetchImpl ?? fetch
  const part = `${o.dest}.part`
  let hash = createHash('sha256')
  let received = 0
  let total: number | null = o.expectedSize ?? null
  let lastEmit = 0
  try {
    for (let attempt = 1; ; attempt++) {
      const stall = new AbortController()
      const signal = AbortSignal.any([o.signal, stall.signal])
      let lastData = Date.now()
      const watchdog = setInterval(() => {
        if (Date.now() - lastData > STALL_MS) stall.abort()
      }, 1000)
      try {
        const res = await f(o.url, { signal, redirect: 'follow', headers: received ? { Range: `bytes=${received}-` } : undefined })
        if (!res.ok || !res.body) throw Object.assign(new Error(`Download failed: HTTP ${res.status}`), { fatal: res.status >= 400 && res.status < 500 })
        if (received && res.status !== 206) {
          // The server ignored the range: start over.
          received = 0
          hash = createHash('sha256')
        }
        const length = Number(res.headers.get('content-length') ?? '') || null
        const range = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '')
        total = (range ? Number(range[1]) : length && !received ? length : null) ?? total
        const out = createWriteStream(part, { flags: received ? 'a' : 'w' })
        const meter = new Transform({
          transform(chunk: Buffer, _enc, cb) {
            lastData = Date.now()
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
        await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), meter, out, { signal })
        break
      } catch (e) {
        if (o.signal.aborted || (e as { fatal?: boolean }).fatal || attempt >= MAX_ATTEMPTS) throw e
        await new Promise((r) => setTimeout(r, Math.min(10_000, 1000 * attempt)))
      } finally {
        clearInterval(watchdog)
      }
    }
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
