/**
 * Self-update on macOS without an Apple Developer ID. Squirrel.Mac (electron-updater's MacUpdater)
 * accepts only an update signed by the same developer, and an ad-hoc signed app has none, so the
 * app does it itself: downloads the ZIP of its processor, checks its SHA-512 against latest-mac.yml,
 * unpacks it with `ditto`, checks the version and the bundle signature, and after quitting swaps the
 * bundle in place (the old one is kept until the new one is copied) and starts the new version.
 */
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>

/** Streams `url` into `dest`, reporting progress, and rejects unless the SHA-512 matches. */
export async function downloadVerified(
  fetcher: Fetcher,
  url: string,
  dest: string,
  sha512: string,
  onProgress: (transferred: number, total: number) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetcher(url, { signal })
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
  const hash = createHash('sha512')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const out = fs.createWriteStream(dest)
  let transferred = 0
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      transferred += value.length
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      onProgress(transferred, total)
    }
    await new Promise<void>((resolve, reject) =>
      out.end((err?: Error | null) => (err ? reject(err) : resolve()))
    )
  } catch (err) {
    out.destroy()
    fs.rmSync(dest, { force: true })
    throw err
  }
  if (hash.digest('base64') !== sha512) {
    fs.rmSync(dest, { force: true })
    throw new Error('The downloaded update is damaged (SHA-512 mismatch)')
  }
}

/** Unpacks the ZIP and returns the path of the checked `.app` inside. */
export async function unpackApp(zip: string, dir: string, version: string): Promise<string> {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  await run('/usr/bin/ditto', ['-x', '-k', zip, dir])
  const name = fs.readdirSync(dir).find((n) => n.endsWith('.app'))
  if (!name) throw new Error('No application in the update')
  const bundle = path.join(dir, name)
  const { stdout } = await run('/usr/bin/plutil', [
    '-extract',
    'CFBundleShortVersionString',
    'raw',
    '-o',
    '-',
    path.join(bundle, 'Contents', 'Info.plist')
  ])
  if (stdout.trim() !== version)
    throw new Error(`The update is version ${stdout.trim()}, expected ${version}`)
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])
  return bundle
}

/** `/Applications/VoiceFlow AI.app` for the running executable, or null outside a bundle. */
export function bundleOf(exe: string): string | null {
  const bundle = path.resolve(exe, '..', '..', '..')
  return bundle.endsWith('.app') ? bundle : null
}

/**
 * The bundle can be replaced only where the user may write, and not when macOS runs it from a
 * read-only copy (App Translocation, a mounted DMG).
 */
export function canReplace(bundle: string): boolean {
  if (bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return false
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK)
    fs.accessSync(bundle, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

const SWAP_SCRIPT = `#!/bin/bash
# VoiceFlow AI update: wait for the app to quit, swap the bundle, start the new version.
PID="$1"; OLD="$2"; NEW="$3"; WORK="$4"
for _ in $(seq 1 600); do kill -0 "$PID" 2>/dev/null || break; sleep 0.1; done
BAK="$OLD.previous"
rm -rf "$BAK"
if mv "$OLD" "$BAK" && /usr/bin/ditto "$NEW" "$OLD"; then
  /usr/bin/xattr -dr com.apple.quarantine "$OLD" 2>/dev/null
  rm -rf "$BAK" "$WORK"
else
  rm -rf "$OLD"
  mv "$BAK" "$OLD"
fi
/usr/bin/open "$OLD"
`

/** Starts the detached swap; the caller quits the app right after. */
export function scheduleSwap(bundle: string, newApp: string, workDir: string): void {
  const script = path.join(workDir, 'install.sh')
  fs.writeFileSync(script, SWAP_SCRIPT, { mode: 0o755 })
  spawn('/bin/bash', [script, String(process.pid), bundle, newApp, workDir], {
    detached: true,
    stdio: 'ignore'
  }).unref()
}
