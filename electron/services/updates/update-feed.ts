/**
 * Which release this computer updates from. Windows and macOS builds are attached to the same
 * GitHub releases but may appear at different times (the Mac build comes from CI later), so each
 * system looks for the newest release that has its own update file: `latest.yml` for Windows,
 * `latest-mac.yml` for macOS. A release without it is skipped instead of failing the check.
 */
import { compareVersions } from '../../../shared/app-config'

export interface FeedFile {
  url: string
  sha512: string
  size: number
}

export interface Feed {
  version: string
  files: FeedFile[]
  releaseDate?: string
}

export interface FeedRelease {
  tag: string
  version: string
  name: string
  notes: string
  url: string
  publishedAt: string | null
  feed: Feed
}

export function channelFile(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml'
}

const unquote = (v: string): string => v.trim().replace(/^(['"])(.*)\1$/, '$2')

/**
 * Reads the `latest*.yml` that electron-builder writes. Only its simple shape is supported:
 * top-level `key: value` pairs and the `files:` list of `url / sha512 / size` entries.
 */
export function parseFeed(text: string): Feed {
  const files: FeedFile[] = []
  const top: Record<string, string> = {}
  let inFiles = false
  let cur: Partial<FeedFile> | null = null
  const flush = (): void => {
    if (cur?.url && cur.sha512) files.push({ url: cur.url, sha512: cur.sha512, size: cur.size ?? 0 })
    cur = null
  }
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue
    const indent = raw.length - raw.trimStart().length
    const line = raw.trim()
    if (indent === 0) {
      flush()
      inFiles = line === 'files:'
      const m = /^([\w-]+):\s*(.*)$/.exec(line)
      if (m && !inFiles) top[m[1]!] = unquote(m[2]!)
      continue
    }
    if (!inFiles) continue
    const item = line.startsWith('- ')
    if (item) flush()
    const m = /^(?:- )?([\w-]+):\s*(.*)$/.exec(line)
    if (!m) continue
    cur ??= {}
    const value = unquote(m[2]!)
    if (m[1] === 'url') cur.url = value
    else if (m[1] === 'sha512') cur.sha512 = value
    else if (m[1] === 'size') cur.size = Number(value) || 0
  }
  flush()
  if (!top['version']) throw new Error('No version in the update file')
  // Old files list only `path` + `sha512` at the top level.
  if (!files.length && top['path'] && top['sha512'])
    files.push({ url: top['path'], sha512: top['sha512'], size: 0 })
  return { version: top['version'], files, releaseDate: top['releaseDate'] }
}

export interface GithubRelease {
  tag_name: string
  name?: string | null
  body?: string | null
  html_url: string
  published_at?: string | null
  draft: boolean
  prerelease: boolean
  assets: { name: string }[]
}

/** The newest published (not draft, not pre-release) release that has `file`. */
export function pickRelease(list: GithubRelease[], file: string): GithubRelease | null {
  const usable = list.filter((r) => !r.draft && !r.prerelease && r.assets.some((a) => a.name === file))
  usable.sort((a, b) => compareVersions(b.tag_name.replace(/^v/, ''), a.tag_name.replace(/^v/, '')))
  return usable[0] ?? null
}

/** The installer of this processor in the feed (`…-arm64-mac.zip` on Apple Silicon). */
export function pickMacZip(feed: Feed, arch: string): FeedFile | null {
  const zips = feed.files.filter((f) => f.url.endsWith('.zip'))
  return zips.find((f) => f.url.includes(`-${arch}-`)) ?? null
}

/** Markdown of a release → short plain text for the update card. */
export function notesPlain(md: string): string {
  return md
    .replace(/<[^>]+>/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 4000)
}
