/**
 * Updates from GitHub Releases (imomzoda-dev/VoiceFlowAI). Each system follows its own builds:
 * Windows the newest release with `latest.yml`, macOS the newest with `latest-mac.yml`.
 *  - Windows: electron-updater downloads the NSIS installer, checks its SHA-512 and installs on restart.
 *  - macOS: Squirrel.Mac only accepts updates signed by the same Apple developer, and an ad-hoc signed
 *    app has none — so the app downloads the ZIP, checks SHA-512 + version + signature and swaps
 *    its own bundle after quitting (mac-update.ts).
 * Nothing downloads without a click. Development runs report "unsupported".
 */
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { app, net, shell } from 'electron'
import type { AppUpdater, CancellationToken, ProgressInfo, UpdateInfo } from 'electron-updater'
import { APP_CONFIG, compareVersions } from '../../../shared/app-config'
import type { UpdateState } from '../../../shared/types'
import { createLogger } from '../../main/logger'
import { bundleOf, canReplace, downloadVerified, scheduleSwap, unpackApp } from './mac-update'
import { channelFile, notesPlain, parseFeed, pickMacZip, pickRelease, type FeedRelease, type GithubRelease } from './update-feed'

const log = createLogger('updater')
const FIRST_CHECK_DELAY_MS = 4_000
const FRESH_CHECK_MS = 60_000
const CHECK_INTERVAL_MS = 4 * 3600_000
const GITHUB = `https://github.com/${APP_CONFIG.releasesRepo}`
const UA = { 'User-Agent': 'VoiceFlow-AI-Desktop' }
const isMac = process.platform === 'darwin'

type UpdaterModule = typeof import('electron-updater')

/** electron-updater is CommonJS with a lazy `autoUpdater` getter: read it from the default export when needed. */
function resolveUpdaterModule(imported: UpdaterModule & { default?: UpdaterModule }): UpdaterModule {
  return imported.default && !('autoUpdater' in imported && imported.autoUpdater) ? imported.default : imported
}

const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0]!.slice(0, 300)

export class UpdaterService extends EventEmitter {
  private state: UpdateState
  private cancel: CancellationToken | null = null
  private macAbort: AbortController | null = null
  private macReady: { app: string; work: string } | null = null
  private release: FeedRelease | null = null
  private timer: NodeJS.Timeout | null = null
  private inflight: Promise<UpdateState> | null = null
  private mod: UpdaterModule | null = null
  private notes = new Map<string, { name: string; body: string; url: string }>()

  constructor(
    private readonly currentVersion: string,
    private readonly packaged: boolean,
    private readonly workDir: string
  ) {
    super()
    this.state = { phase: packaged ? 'idle' : 'unsupported', currentVersion }
  }

  get(): UpdateState {
    return this.state
  }

  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch }
    this.emit('state', this.state)
  }

  /** The newest release for this system: `releases/latest` when it has our feed file, else the API list. */
  private async resolveRelease(): Promise<FeedRelease> {
    const file = channelFile(process.platform)
    const latest = await net.fetch(`${GITHUB}/releases/latest/download/${file}`, { headers: UA, signal: AbortSignal.timeout(15_000) })
    let tag: string
    let text: string
    if (latest.ok) {
      text = await latest.text()
      tag = `v${parseFeed(text).version}`
    } else {
      // The newest release may not have this system's build yet (e.g. the Mac build still in CI).
      const res = await net.fetch(`https://api.github.com/repos/${APP_CONFIG.releasesRepo}/releases?per_page=20`, {
        headers: { ...UA, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15_000)
      })
      if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`)
      const picked = pickRelease((await res.json()) as GithubRelease[], file)
      if (!picked) throw new Error(`No release has ${file}`)
      tag = picked.tag_name
      const yml = await net.fetch(`${GITHUB}/releases/download/${tag}/${file}`, { headers: UA, signal: AbortSignal.timeout(15_000) })
      if (!yml.ok) throw new Error(`${file}: HTTP ${yml.status}`)
      text = await yml.text()
    }
    const feed = parseFeed(text)
    return { tag, version: feed.version, name: tag, notes: '', url: `${GITHUB}/releases/tag/${tag}`, publishedAt: feed.releaseDate ?? null, feed }
  }

  /** Release notes (Markdown) of a version, for the update card and "What's new". */
  async releaseNotes(version: string) {
    const cached = this.notes.get(version)
    if (cached) return cached
    try {
      const res = await net.fetch(`https://api.github.com/repos/${APP_CONFIG.releasesRepo}/releases/tags/v${encodeURIComponent(version)}`, {
        headers: { ...UA, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10_000)
      })
      if (!res.ok) return null
      const r = (await res.json()) as { name?: string; body?: string; html_url?: string }
      const n = { name: r.name || `v${version}`, body: (r.body ?? '').slice(0, 20_000), url: r.html_url ?? `${GITHUB}/releases/tag/v${version}` }
      this.notes.set(version, n)
      return n
    } catch {
      return null
    }
  }

  private async announce(rel: FeedRelease) {
    const n = await this.releaseNotes(rel.version)
    this.set({
      phase: 'available',
      version: rel.version,
      releaseName: n?.name || rel.name,
      releaseNotes: n ? notesPlain(n.body) : '',
      releaseDate: rel.publishedAt ?? undefined,
      releaseUrl: n?.url ?? rel.url,
      checkedAt: Date.now(),
      error: undefined
    })
  }

  private async updater(): Promise<AppUpdater> {
    if (this.mod) return this.mod.autoUpdater
    this.mod = resolveUpdaterModule(await import('electron-updater'))
    const u = this.mod.autoUpdater
    if (!u) throw new Error('electron-updater is not available')
    u.autoDownload = false
    u.autoInstallOnAppQuit = false
    u.allowPrerelease = false
    u.logger = { info: (m: unknown) => log.info(String(m)), warn: (m: unknown) => log.warn(String(m)), error: (m: unknown) => log.error(String(m)), debug: () => undefined }
    u.on('checking-for-update', () => this.set({ phase: 'checking', error: undefined }))
    u.on('update-available', (info: UpdateInfo) => {
      if (this.release?.version === info.version) return void this.announce(this.release)
      this.set({ phase: 'available', version: info.version, releaseName: info.releaseName ?? `v${info.version}`, releaseUrl: `${GITHUB}/releases/tag/v${info.version}`, checkedAt: Date.now() })
    })
    u.on('update-not-available', (info: UpdateInfo) => this.set({ phase: 'not-available', version: info.version, checkedAt: Date.now() }))
    u.on('download-progress', (p: ProgressInfo) =>
      // At 100% electron-updater still checks the SHA-512 before "downloaded".
      this.set({ phase: p.percent >= 99.9 ? 'verifying' : 'downloading', percent: p.percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond })
    )
    u.on('update-downloaded', (info: UpdateInfo) => this.set({ phase: 'downloaded', version: info.version, percent: 100 }))
    u.on('error', (err: Error) => {
      if (this.state.phase === 'installing') return
      log.warn('update failed', { message: err.message })
      this.set({ phase: 'error', error: firstLine(err) })
    })
    return u
  }

  /** One check at a time: a second caller waits for the same answer. */
  check(): Promise<UpdateState> {
    this.inflight ??= this.runCheck().finally(() => (this.inflight = null))
    return this.inflight
  }

  private async runCheck(): Promise<UpdateState> {
    if (!this.packaged) return this.state
    if (['downloading', 'verifying', 'downloaded', 'installing'].includes(this.state.phase)) return this.state
    this.set({ phase: 'checking', error: undefined })
    try {
      const rel = await this.resolveRelease()
      this.release = rel
      if (compareVersions(rel.version, this.currentVersion) <= 0) {
        this.set({ phase: 'not-available', version: rel.version, checkedAt: Date.now() })
      } else if (isMac) {
        await this.announce(rel)
      } else {
        const u = await this.updater()
        u.setFeedURL({ provider: 'generic', url: `${GITHUB}/releases/download/${rel.tag}` })
        await u.checkForUpdates()
      }
    } catch (err) {
      log.warn('update check failed', { message: firstLine(err) })
      this.set({ phase: 'error', error: firstLine(err), checkedAt: Date.now() })
    }
    return this.state
  }

  async download(): Promise<void> {
    if (!this.packaged || this.state.phase !== 'available') return
    if (isMac) return this.downloadMac()
    const u = await this.updater()
    this.cancel = new this.mod!.CancellationToken()
    this.set({ phase: 'downloading', percent: 0, transferred: 0, total: undefined, error: undefined })
    try {
      await u.downloadUpdate(this.cancel)
    } catch (err) {
      if (this.cancel?.cancelled) this.set({ phase: 'available', percent: undefined })
      else this.set({ phase: 'error', error: firstLine(err) })
    } finally {
      this.cancel = null
    }
  }

  private async downloadMac(): Promise<void> {
    const rel = this.release
    const zip = rel ? pickMacZip(rel.feed, process.arch) : null
    const bundle = bundleOf(app.getPath('exe'))
    // Started from the DMG, or from a folder the user can't write to: hand over the installer instead.
    if (!rel || !zip || !bundle || !canReplace(bundle)) {
      log.info('cannot replace the bundle here; opening the DMG', { bundle })
      await shell.openExternal(`${GITHUB}/releases/download/v${this.state.version}/${APP_CONFIG.macDmg(this.state.version!, process.arch === 'arm64' ? 'arm64' : 'x64')}`)
      return
    }
    const abort = new AbortController()
    this.macAbort = abort
    const work = path.join(this.workDir, rel.version)
    const file = path.join(work, path.basename(zip.url))
    const started = Date.now()
    let last = 0
    this.set({ phase: 'downloading', percent: 0, transferred: 0, total: zip.size || undefined, error: undefined })
    try {
      await downloadVerified(
        (url, init) => net.fetch(url, init),
        `${GITHUB}/releases/download/${rel.tag}/${encodeURIComponent(zip.url)}`,
        file,
        zip.sha512,
        (transferred, total) => {
          const now = Date.now()
          if (now - last < 250) return
          last = now
          const size = total || zip.size
          this.set({ phase: 'downloading', transferred, total: size || undefined, percent: size ? Math.min(99, (transferred / size) * 100) : undefined, bytesPerSecond: transferred / Math.max(0.001, (now - started) / 1000) })
        },
        abort.signal
      )
      this.set({ phase: 'verifying', percent: 100 })
      this.macReady = { app: await unpackApp(file, path.join(work, 'app'), rel.version), work }
      this.set({ phase: 'downloaded', version: rel.version, percent: 100 })
    } catch (err) {
      if (abort.signal.aborted) this.set({ phase: 'available', percent: undefined })
      else {
        log.warn('mac update failed', { message: firstLine(err) })
        this.set({ phase: 'error', error: firstLine(err) })
      }
    } finally {
      this.macAbort = null
    }
  }

  cancelDownload() {
    this.cancel?.cancel()
    this.macAbort?.abort()
  }

  /** Quits and installs the verified update; the new version starts by itself. */
  install(beforeQuit: () => Promise<void>) {
    if (this.state.phase !== 'downloaded') return
    log.info(`installing update ${this.state.version}`)
    this.set({ phase: 'installing' })
    void beforeQuit().finally(() => {
      if (isMac) {
        const bundle = bundleOf(app.getPath('exe'))
        if (!bundle || !this.macReady) return this.set({ phase: 'error', error: 'Update package is missing' })
        scheduleSwap(bundle, this.macReady.app, this.macReady.work)
        setTimeout(() => app.quit(), 300)
        return
      }
      setTimeout(() => this.mod?.autoUpdater.quitAndInstall(false, true), 300)
    })
  }

  /** First check shortly after start, then every 4 hours (when automatic checks are on). */
  schedule(enabled: () => boolean) {
    if (!this.packaged || this.timer) return
    const tick = () => {
      const fresh = !!this.state.checkedAt && Date.now() - this.state.checkedAt < FRESH_CHECK_MS
      if (enabled() && !fresh) void this.check()
    }
    setTimeout(tick, FIRST_CHECK_DELAY_MS).unref?.()
    this.timer = setInterval(tick, CHECK_INTERVAL_MS)
    this.timer.unref?.()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
