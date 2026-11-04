/**
 * Manages local whisper.cpp assets: the `whisper-cli` executable and ggml model files.
 * Nothing is downloaded without an explicit user action.
 */
import { existsSync, readdirSync, statSync, writeFileSync, readFileSync, chmodSync } from 'node:fs'
import { rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import extract from 'extract-zip'
import { WHISPER_MODELS, WHISPER_MODEL_BASE_URL, catalogModel } from './model-catalog'
import { downloadFile, fetchHuggingFaceChecksum } from './downloader'
import type { SpeechModelsRepository } from '../../db/misc-repos'
import type { DownloadProgress, WhisperBinaryStatus, WhisperModelInfo } from '../../../shared/types'
import { createLogger } from '../../main/logger'

const log = createLogger('local-speech')

const EXE = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'

/** Finds the first of `names` (in priority order) anywhere under `dir`. */
function findFile(dir: string, names: string[], depth = 4): string | null {
  for (const name of names) {
    const hit = findOne(dir, name, depth)
    if (hit) return hit
  }
  return null
}

function findOne(dir: string, name: string, depth: number): string | null {
  if (!existsSync(dir) || depth < 0) return null
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isFile() && entry.toLowerCase() === name) return full
    if (st.isDirectory()) {
      const found = findOne(full, name, depth - 1)
      if (found) return found
    }
  }
  return null
}

function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const tool = process.platform === 'win32' ? 'where' : 'which'
    execFile(tool, [cmd], { windowsHide: true, timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(null)
      const first = stdout.split(/\r?\n/).find((l) => l.trim())
      resolve(first?.trim() ?? null)
    })
  })
}

export class LocalSpeechService extends EventEmitter {
  private downloads = new Map<string, AbortController>()

  constructor(
    private readonly dirs: { models: string; bin: string; temp: string; resources: string },
    private readonly repo: SpeechModelsRepository,
    private readonly getCustomBinary: () => string | null
  ) {
    super()
  }

  /* ----------------------------------- models ----------------------------------- */

  modelPath(id: string): string | null {
    const m = catalogModel(id)
    if (!m) return null
    const p = join(this.dirs.models, m.file)
    return existsSync(p) ? p : null
  }

  async catalog(): Promise<WhisperModelInfo[]> {
    const rows = new Map((await this.repo.list()).map((r) => [r.id, r]))
    return WHISPER_MODELS.map((m) => {
      const path = join(this.dirs.models, m.file)
      const installed = existsSync(path)
      const row = rows.get(m.id)
      return {
        ...m,
        installed,
        verified: installed ? (row?.verified ?? null) : null,
        sizeBytes: installed ? statSync(path).size : null,
        path: installed ? path : null
      }
    })
  }

  private progress(p: DownloadProgress) {
    this.emit('progress', p)
  }

  async download(id: string): Promise<{ ok: boolean; error?: string }> {
    const m = catalogModel(id)
    if (!m) return { ok: false, error: 'Unknown model' }
    if (this.downloads.has(id)) return { ok: false, error: 'Already downloading' }
    const ctrl = new AbortController()
    this.downloads.set(id, ctrl)
    const url = m.url ?? WHISPER_MODEL_BASE_URL + m.file
    try {
      await mkdir(this.dirs.models, { recursive: true })
      this.progress({ id, receivedBytes: 0, totalBytes: null, state: 'downloading' })
      const { sha256, size } = m.sha256 ? { sha256: m.sha256, size: null } : await fetchHuggingFaceChecksum(url)
      if (!sha256) log.warn(`No published checksum for ${m.file}; file will be stored as unverified`)
      const dest = join(this.dirs.models, m.file)
      const res = await downloadFile({
        url,
        dest,
        signal: ctrl.signal,
        expectedSha256: sha256,
        expectedSize: size,
        onProgress: (r, t) => this.progress({ id, receivedBytes: r, totalBytes: t, state: 'downloading' })
      })
      await this.repo.upsert({ id, engine: 'whisper-cpp', fileName: m.file, path: dest, sizeBytes: res.size, sha256: res.sha256, verified: res.verified, installedAt: Date.now() })
      this.progress({ id, receivedBytes: res.size, totalBytes: res.size, state: 'done', message: res.verified ? 'verified' : 'unverified' })
      log.info(`Installed model ${m.file}`, { size: res.size, verified: res.verified })
      return { ok: true }
    } catch (e) {
      const cancelled = ctrl.signal.aborted
      const message = cancelled ? 'Cancelled' : (e as Error).message
      this.progress({ id, receivedBytes: 0, totalBytes: null, state: cancelled ? 'cancelled' : 'error', message })
      if (!cancelled) log.error(`Model download failed: ${m.file}`, e)
      return { ok: false, error: message }
    } finally {
      this.downloads.delete(id)
    }
  }

  cancel(id: string) {
    this.downloads.get(id)?.abort()
  }

  async remove(id: string) {
    const m = catalogModel(id)
    if (!m) return
    await rm(join(this.dirs.models, m.file), { force: true })
    await this.repo.remove(id)
  }

  /* ----------------------------------- binary ----------------------------------- */

  private nvidia: Promise<string | null> | null = null

  /** NVIDIA GPU name via nvidia-smi (installed with the NVIDIA driver), or null. Cached. */
  detectNvidia(): Promise<string | null> {
    if (process.platform !== 'win32') return Promise.resolve(null)
    this.nvidia ??= new Promise((resolve) => {
      execFile('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
        resolve(err ? null : stdout.split(/\r?\n/).find((l) => l.trim())?.trim() ?? null)
      })
    })
    return this.nvidia
  }

  /** The installed CUDA build's whisper-cli, if any. */
  gpuBinary(): string | null {
    return findFile(join(this.dirs.bin, 'whisper-cuda'), [EXE])
  }

  async binaryStatus(): Promise<WhisperBinaryStatus> {
    const s = await this.binaryStatusBase()
    return { ...s, nvidiaGpu: await this.detectNvidia(), gpuPath: this.gpuBinary() }
  }

  private async binaryStatusBase(): Promise<Omit<WhisperBinaryStatus, 'nvidiaGpu' | 'gpuPath'>> {
    const canAutoInstall = process.platform === 'win32' && process.arch === 'x64'
    const version = (dir: string) => {
      try {
        return readFileSync(join(dir, 'VERSION'), 'utf8').trim()
      } catch {
        return null
      }
    }
    const custom = this.getCustomBinary()
    if (custom && existsSync(custom)) return { found: true, path: custom, source: 'custom', version: null, canAutoInstall }
    const downloadedDir = join(this.dirs.bin, 'whisper')
    const downloaded = findFile(downloadedDir, [EXE, process.platform === 'win32' ? 'main.exe' : 'main'])
    if (downloaded) return { found: true, path: downloaded, source: 'downloaded', version: version(downloadedDir), canAutoInstall }
    const bundled = findFile(join(this.dirs.resources, 'bin'), [EXE])
    if (bundled) return { found: true, path: bundled, source: 'bundled', version: null, canAutoInstall }
    const candidates = process.platform === 'darwin' ? ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'] : []
    for (const c of candidates) if (existsSync(c)) return { found: true, path: c, source: 'system', version: null, canAutoInstall }
    const onPath = await which('whisper-cli')
    if (onPath) return { found: true, path: onPath, source: 'system', version: null, canAutoInstall }
    return { found: false, path: null, source: null, version: null, canAutoInstall }
  }

  /**
   * Windows x64: downloads the official CPU build (whisper-bin-x64.zip) from the latest
   * ggml-org/whisper.cpp GitHub release, verifying the asset digest when GitHub provides one.
   */
  async installBinary(variant: 'cpu' | 'cuda' = 'cpu'): Promise<{ ok: boolean; error?: string; path?: string }> {
    if (process.platform !== 'win32' || process.arch !== 'x64') {
      return { ok: false, error: process.platform === 'darwin' ? 'On macOS install it with Homebrew: brew install whisper-cpp' : 'Automatic install is only available on Windows x64' }
    }
    // CPU: whisper-bin-x64.zip. NVIDIA GPU: the CUDA 12.4 build (ships cuBLAS; GTX 900-series and newer, drivers ≥ 551).
    const assetName = variant === 'cuda' ? 'whisper-bin-win-cuda-12.4.0-x64.zip' : 'whisper-bin-x64.zip'
    const id = variant === 'cuda' ? 'whisper-gpu' : 'whisper-binary'
    const ctrl = new AbortController()
    this.downloads.set(id, ctrl)
    try {
      this.progress({ id, receivedBytes: 0, totalBytes: null, state: 'downloading' })
      // whisper.cpp publishes version releases (e.g. v1.9.5, often without assets) and separate
      // build releases (e.g. b5454) that carry the binaries — take the newest one that has the asset.
      const rel = await fetch('https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=15', {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'VoiceFlow-AI' },
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(20_000)])
      })
      if (!rel.ok) throw new Error(`GitHub API returned HTTP ${rel.status}`)
      type Release = { tag_name: string; draft: boolean; prerelease: boolean; assets: { name: string; browser_download_url: string; size: number; digest?: string | null }[] }
      const releases = (await rel.json()) as Release[]
      const data = releases.find((r) => !r.draft && r.assets.some((a) => a.name === assetName))
      const asset = data?.assets.find((a) => a.name === assetName)
      if (!data || !asset) throw new Error(`${assetName} was not found in recent whisper.cpp releases`)
      const zipPath = join(this.dirs.temp, `${variant}-whisper-${data.tag_name}.zip`)
      const digest = asset.digest?.startsWith('sha256:') ? asset.digest.slice(7) : null
      await downloadFile({
        url: asset.browser_download_url,
        dest: zipPath,
        signal: ctrl.signal,
        expectedSha256: digest,
        expectedSize: asset.size,
        onProgress: (r, t) => this.progress({ id, receivedBytes: r, totalBytes: t, state: 'downloading' })
      })
      const target = join(this.dirs.bin, variant === 'cuda' ? 'whisper-cuda' : 'whisper')
      await rm(target, { recursive: true, force: true })
      await mkdir(target, { recursive: true })
      await extract(zipPath, { dir: target })
      await rm(zipPath, { force: true })
      writeFileSync(join(target, 'VERSION'), data.tag_name)
      const exe = findFile(target, [EXE, 'main.exe'])
      if (!exe) throw new Error('whisper-cli.exe was not found inside the archive')
      if (process.platform !== 'win32') chmodSync(exe, 0o755)
      this.progress({ id, receivedBytes: asset.size, totalBytes: asset.size, state: 'done', message: digest ? 'verified' : 'unverified' })
      log.info(`Installed whisper.cpp ${data.tag_name} (${variant})`, { verified: Boolean(digest) })
      return { ok: true, path: exe }
    } catch (e) {
      const message = ctrl.signal.aborted ? 'Cancelled' : (e as Error).message
      this.progress({ id, receivedBytes: 0, totalBytes: null, state: ctrl.signal.aborted ? 'cancelled' : 'error', message })
      log.error('whisper.cpp install failed', e)
      return { ok: false, error: message }
    } finally {
      this.downloads.delete(id)
    }
  }
}
