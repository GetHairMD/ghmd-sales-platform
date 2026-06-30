import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TARGET_TAXONOMIES,
  EXCLUDED_TAXONOMIES,
  filterProvidersByTargetTaxonomy,
  type NpiProviderRecord,
} from '../client'

// ---------------------------------------------------------------------------
// (1) Target taxonomy codes are present in the constant.
// ---------------------------------------------------------------------------
describe('TARGET_TAXONOMIES', () => {
  const EXPECTED_TARGETS = [
    '208200000X', // Plastic Surgery
    '207XS0114X', // Plastic Surgery — Surgery of the Hand
    '207YS0123X', // Otolaryngology — Facial Plastic Surgery
    '207ND0900X', // Dermatology
    '207N00000X', // Dermatology (general)
    '204D00000X', // Neuromusculoskeletal Medicine
  ]

  it.each(EXPECTED_TARGETS)('includes target code %s', (code) => {
    expect(TARGET_TAXONOMIES).toContain(code)
  })

  it('contains exactly the expected target codes (no extras)', () => {
    expect([...TARGET_TAXONOMIES].sort()).toEqual([...EXPECTED_TARGETS].sort())
  })

  it('has no duplicate codes', () => {
    expect(new Set(TARGET_TAXONOMIES).size).toBe(TARGET_TAXONOMIES.length)
  })
})

// ---------------------------------------------------------------------------
// (2) Excluded codes are NOT in the target list.
// ---------------------------------------------------------------------------
describe('EXCLUDED_TAXONOMIES', () => {
  it('includes the Cardiovascular Disease code', () => {
    expect(EXCLUDED_TAXONOMIES).toContain('207RC0000X')
  })

  it('shares no codes with TARGET_TAXONOMIES', () => {
    const targets = new Set<string>(TARGET_TAXONOMIES)
    for (const code of EXCLUDED_TAXONOMIES) {
      expect(targets.has(code)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// (3) filterProvidersByTargetTaxonomy returns only matching providers.
// ---------------------------------------------------------------------------
describe('filterProvidersByTargetTaxonomy', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const provider = (number: string, ...codes: string[]): NpiProviderRecord => ({
    number,
    taxonomies: codes.map((code) => ({ code })),
  })

  it('keeps only providers carrying a target taxonomy code', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const providers: NpiProviderRecord[] = [
      provider('1000000001', '208200000X'), // Plastic Surgery — keep
      provider('1000000002', '207N00000X'), // Dermatology — keep
      provider('1000000003', '207RC0000X'), // Cardiovascular — drop (excluded)
      provider('1000000004', '999999999X'), // unknown — drop
      provider('1000000005'), // no taxonomies — drop
    ]

    const kept = filterProvidersByTargetTaxonomy(providers)

    expect(kept.map((p) => p.number)).toEqual(['1000000001', '1000000002'])
  })

  it('keeps a multi-specialty provider that holds at least one target code', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Provider holds an excluded code AND a target code → kept, but flagged.
    const providers = [provider('1000000006', '207RC0000X', '207ND0900X')]

    const kept = filterProvidersByTargetTaxonomy(providers)

    expect(kept.map((p) => p.number)).toEqual(['1000000006'])
  })

  it('flags (logs) when an excluded taxonomy is present', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    filterProvidersByTargetTaxonomy([provider('1000000007', '207RC0000X')])

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('207RC0000X')
  })

  it('returns an empty array when given no providers', () => {
    expect(filterProvidersByTargetTaxonomy([])).toEqual([])
  })

  it('does not log for providers with only target / unknown taxonomies', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    filterProvidersByTargetTaxonomy([
      provider('1000000008', '208200000X'),
      provider('1000000009', '999999999X'),
    ])

    expect(warn).not.toHaveBeenCalled()
  })
})
