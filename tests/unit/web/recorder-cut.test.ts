import { describe, expect, it } from 'vitest'
import { quietestCut } from '../../../src/services/audio/mic-recorder'

describe('phrase cut at the length limit', () => {
  const chunkMs = 85
  it('cuts in the gap between words, not at a single quiet chunk inside a word', () => {
    // 100 chunks of speech (level 0.8); a lone dip at 95 (soft consonant) and a real gap at 80–83.
    const levels = Array.from({ length: 100 }, () => 0.8)
    levels[95] = 0.05
    for (let i = 80; i <= 83; i++) levels[i] = 0.1
    const cut = quietestCut(levels, chunkMs)
    expect(cut).toBeGreaterThanOrEqual(80)
    expect(cut).toBeLessThanOrEqual(84)
  })
  it('never returns an empty phrase', () => {
    expect(quietestCut([], chunkMs)).toBe(1)
    expect(quietestCut([0.5], chunkMs)).toBe(1)
    expect(quietestCut(Array(50).fill(0.8), chunkMs)).toBeGreaterThan(0)
  })
})
