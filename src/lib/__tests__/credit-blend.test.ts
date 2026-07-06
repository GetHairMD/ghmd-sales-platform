import { describe, expect, it } from 'vitest'
import {
  blendCreditShareByHouseholds,
  creditShareForState,
} from '../credit-share'
import { EXPERIAN_NATIONAL_CREDIT_SHARE } from '../../../lib/addressable-market-constants'
import creditTable from '../../../data/experian-credit-share-by-state.json'

const table = { states: (creditTable as { states: Record<string, number> }).states }

describe('blendCreditShareByHouseholds (multi-state, flag #4)', () => {
  it('single-state polygon collapses to creditShareForState', () => {
    expect(blendCreditShareByHouseholds({ TX: 1234 }, table)).toBe(creditShareForState('TX', table))
  })

  it('household-weights per-state shares across a multi-state polygon', () => {
    const stateHH = { TX: 1000, OK: 500 } // total 1500
    const expected =
      (1000 / 1500) * creditShareForState('TX', table) +
      (500 / 1500) * creditShareForState('OK', table)
    expect(blendCreditShareByHouseholds(stateHH, table)).toBeCloseTo(expected, 12)
  })

  it('the blend lies between the two state shares it mixes', () => {
    const blend = blendCreditShareByHouseholds({ TX: 1000, OK: 500 }, table)
    const lo = Math.min(creditShareForState('TX', table), creditShareForState('OK', table))
    const hi = Math.max(creditShareForState('TX', table), creditShareForState('OK', table))
    expect(blend).toBeGreaterThanOrEqual(lo)
    expect(blend).toBeLessThanOrEqual(hi)
  })

  it('zero / negative household weights are ignored', () => {
    expect(blendCreditShareByHouseholds({ TX: 1000, OK: 0, XX: -5 }, table)).toBe(
      creditShareForState('TX', table),
    )
  })

  it('empty or all-zero input → national fallback', () => {
    expect(blendCreditShareByHouseholds({}, table)).toBe(EXPERIAN_NATIONAL_CREDIT_SHARE)
    expect(blendCreditShareByHouseholds({ TX: 0 }, table)).toBe(EXPERIAN_NATIONAL_CREDIT_SHARE)
  })
})
