import { describe, it, expect } from 'vitest'
import { compareVersions } from '../../../shared/app-config'
import { channelFile, parseFeed, pickMacZip, pickRelease, notesPlain } from '../../../electron/services/updates/update-feed'
import { bundleOf } from '../../../electron/services/updates/mac-update'

const MAC_YML = `version: 1.1.0
files:
  - url: VoiceFlow-AI-1.1.0-arm64-mac.zip
    sha512: AAA==
    size: 120000000
  - url: VoiceFlow-AI-1.1.0-x64-mac.zip
    sha512: BBB==
    size: 125000000
  - url: VoiceFlow-AI-1.1.0-arm64.dmg
    sha512: CCC==
    size: 130000000
path: VoiceFlow-AI-1.1.0-arm64-mac.zip
sha512: AAA==
releaseDate: '2026-11-04T10:00:00.000Z'
`

describe('update feed', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1)
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1)
  })
  it('uses latest.yml on Windows and latest-mac.yml on macOS', () => {
    expect(channelFile('win32')).toBe('latest.yml')
    expect(channelFile('darwin')).toBe('latest-mac.yml')
  })
  it('parses electron-builder feeds and picks the ZIP for this processor', () => {
    const feed = parseFeed(MAC_YML)
    expect(feed.version).toBe('1.1.0')
    expect(feed.files).toHaveLength(3)
    expect(pickMacZip(feed, 'arm64')?.url).toBe('VoiceFlow-AI-1.1.0-arm64-mac.zip')
    expect(pickMacZip(feed, 'x64')?.sha512).toBe('BBB==')
  })
  it('skips releases without this system’s build, drafts and pre-releases', () => {
    const r = (tag: string, files: string[], extra = {}) => ({ tag_name: tag, html_url: '', draft: false, prerelease: false, assets: files.map((name) => ({ name })), ...extra })
    const list = [r('v1.3.0', ['latest.yml']), r('v1.2.0', ['latest.yml', 'latest-mac.yml']), r('v1.4.0', ['latest-mac.yml'], { prerelease: true }), r('v1.1.0', ['latest-mac.yml'])]
    expect(pickRelease(list, 'latest-mac.yml')?.tag_name).toBe('v1.2.0')
    expect(pickRelease(list, 'latest.yml')?.tag_name).toBe('v1.3.0')
  })
  it('turns release Markdown into plain text for the card', () => {
    expect(notesPlain('## What’s new\n- **Faster** `whisper`\n[link](https://x)')).toBe('What’s new\n- Faster whisper\nlink')
  })
  it.skipIf(process.platform === 'win32')('finds the .app bundle of the running executable (macOS paths)', () => {
    expect(bundleOf('/Applications/VoiceFlow AI.app/Contents/MacOS/VoiceFlow AI')).toBe('/Applications/VoiceFlow AI.app')
  })
})
