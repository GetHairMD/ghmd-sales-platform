import { describe, expect, it } from 'vitest'
import { computePpi, PPI_SIGNAL_NOTE, type PpiInputs } from '../ppi'

// ---------------------------------------------------------------------------
// Base formula: PPI = medianHouseholdIncome / (RPP / 100)
// ---------------------------------------------------------------------------
describe('computePpi — base formula', () => {
  it('returns income unchanged when RPP = 100 (national average)', () => {
    expect(computePpi({ medianHouseholdIncome: 100_000, rpp: 100 })).toBe(100_000)
  })

  it('discounts purchasing power in a high-cost market (RPP > 100)', () => {
    // 100,000 / (125 / 100) = 80,000
    expect(computePpi({ medianHouseholdIncome: 100_000, rpp: 125 })).toBe(80_000)
  })

  it('boosts purchasing power in a low-cost market (RPP < 100)', () => {
    // 80,000 / (80 / 100) = 100,000
    expect(computePpi({ medianHouseholdIncome: 80_000, rpp: 80 })).toBe(100_000)
  })
})

// ---------------------------------------------------------------------------
// Rent-burdened formula: base × (1 − rentBurdenPct)
// ---------------------------------------------------------------------------
describe('computePpi — rent-burdened formula', () => {
  it('applies the rent-burden discount to the base value', () => {
    // base 100,000 × (1 − 0.2) = 80,000
    expect(
      computePpi({ medianHouseholdIncome: 100_000, rpp: 100, rentBurdenPct: 0.2 }),
    ).toBe(80_000)
  })

  it('combines RPP adjustment and rent-burden discount', () => {
    // 100,000 / (125 / 100) = 80,000; × (1 − 0.25) = 60,000
    expect(
      computePpi({ medianHouseholdIncome: 100_000, rpp: 125, rentBurdenPct: 0.25 }),
    ).toBe(60_000)
  })

  it('equals the base value at the 0 boundary (no rent burden)', () => {
    expect(
      computePpi({ medianHouseholdIncome: 100_000, rpp: 100, rentBurdenPct: 0 }),
    ).toBe(100_000)
  })

  it('returns 0 at the 1 boundary (fully rent-burdened)', () => {
    expect(
      computePpi({ medianHouseholdIncome: 100_000, rpp: 100, rentBurdenPct: 1 }),
    ).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Edge cases — never throws, returns 0 on invalid input, falls back to base
// ---------------------------------------------------------------------------
describe('computePpi — edge cases', () => {
  it('returns 0 when RPP = 0 (no divide-by-zero)', () => {
    expect(computePpi({ medianHouseholdIncome: 100_000, rpp: 0 })).toBe(0)
  })

  it('returns 0 when RPP is negative', () => {
    expect(computePpi({ medianHouseholdIncome: 100_000, rpp: -50 })).toBe(0)
  })

  it('falls back to the base formula when rentBurdenPct > 1', () => {
    expect(
      computePpi({ medianHouseholdIncome: 100_000, rpp: 100, rentBurdenPct: 1.5 }),
    ).toBe(100_000)
  })

  it('falls back to the base formula when rentBurdenPct < 0', () => {
    expect(
      computePpi({ medianHouseholdIncome: 100_000, rpp: 100, rentBurdenPct: -0.2 }),
    ).toBe(100_000)
  })

  it('returns 0 when income is missing', () => {
    // Simulate an upstream payload with no income value.
    const inputs = { rpp: 100 } as unknown as PpiInputs
    expect(computePpi(inputs)).toBe(0)
  })

  it('returns 0 when income is negative', () => {
    expect(computePpi({ medianHouseholdIncome: -100_000, rpp: 100 })).toBe(0)
  })

  it('returns 0 when income is NaN', () => {
    expect(computePpi({ medianHouseholdIncome: Number.NaN, rpp: 100 })).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Signal documentation
// ---------------------------------------------------------------------------
describe('PPI_SIGNAL_NOTE', () => {
  it('documents PPI as a relative ranking signal, not an affordability gate', () => {
    expect(PPI_SIGNAL_NOTE).toMatch(/relative ranking/i)
    expect(PPI_SIGNAL_NOTE).toMatch(/not a direct affordability gate/i)
  })
})
