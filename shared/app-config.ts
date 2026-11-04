/** Release / update channel configuration shared by main and renderer. */
export const APP_CONFIG = {
  productName: 'VoiceFlow AI',
  /** Public repository with the installers, release notes and update feeds (latest.yml / latest-mac.yml). */
  releasesRepo: 'imomzoda-dev/VoiceFlowAI',
  /** Installer file names, matching electron-builder.yml artifactName patterns. */
  winInstaller: (v: string) => `VoiceFlow-AI-Setup-${v}.exe`,
  macDmg: (v: string, arch: string) => `VoiceFlow-AI-${v}-${arch}.dmg`
} as const

/** Compares dotted versions numerically (pre-release suffixes sort before the release). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, '').split('-', 2)
    return { nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  if (x.pre === y.pre) return 0
  if (x.pre === null) return 1
  if (y.pre === null) return -1
  return x.pre < y.pre ? -1 : 1
}
