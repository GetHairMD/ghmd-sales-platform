import { describe, expect, it } from 'vitest'
import {
  bracketQualifyingFraction,
  incomeQualifiedShare,
  screenIncomeForZcta,
  B19001_FETCH_VARS,
} from '../income-screen'
import {
  INCOME_QUALIFY_THRESHOLD_ANNUAL,
  INCOME_ROBUSTNESS_THRESHOLD_ANNUAL,
} from '../../../lib/addressable-market-constants'

// ---------------------------------------------------------------------------
// bracketQualifyingFraction — the straddle interpolation primitive
// ---------------------------------------------------------------------------
describe('bracketQualifyingFraction', () => {
  it('returns 1 when threshold is at or below the bracket lower bound', () => {
    expect(bracketQualifyingFraction(35_000, 40_000, 35_000)).toBe(1)
    expect(bracketQualifyingFraction(35_000, 40_000, 30_000)).toBe(1)
  })

  it('returns 0 when threshold is at or above a finite upper bound', () => {
    expect(bracketQualifyingFraction(35_000, 40_000, 40_000)).toBe(0)
    expect(bracketQualifyingFraction(35_000, 40_000, 45_000)).toBe(0)
  })

  it('linearly interpolates inside the straddling bracket', () => {
    // $37,415 in [35k,40k): (40000-37415)/5000 = 0.517
    expect(bracketQualifyingFraction(35_000, 40_000, 37_415)).toBeCloseTo(0.517, 6)
    // $59,865 in [50k,60k): (60000-59865)/10000 = 0.0135
    expect(bracketQualifyingFraction(50_000, 60_000, 59_865)).toBeCloseTo(0.0135, 6)
  })

  it('treats the open top bracket (Infinity) as fully qualifying', () => {
    expect(bracketQualifyingFraction(200_000, Infinity, 37_415)).toBe(1)
    expect(bracketQualifyingFraction(200_000, Infinity, 59_865)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// incomeQualifiedShare
// ---------------------------------------------------------------------------
describe('incomeQualifiedShare', () => {
  it('returns 0 when total households is zero or missing', () => {
    expect(incomeQualifiedShare({}, INCOME_QUALIFY_THRESHOLD_ANNUAL)).toBe(0)
    expect(incomeQualifiedShare({ B19001_001E: 0 }, INCOME_QUALIFY_THRESHOLD_ANNUAL)).toBe(0)
  })

  it('interpolates only the straddling bracket, counts higher brackets fully', () => {
    // all 1000 HH sit in the $35–40k straddle bracket
    const b = { B19001_001E: 1000, B19001_008E: 1000 }
    expect(incomeQualifiedShare(b, INCOME_QUALIFY_THRESHOLD_ANNUAL)).toBeCloseTo(0.517, 6)
    // none qualify at the 5% bound ($59,865 is above this bracket)
    expect(incomeQualifiedShare(b, INCOME_ROBUSTNESS_THRESHOLD_ANNUAL)).toBe(0)
  })

  it('aggregates a multi-bracket distribution correctly', () => {
    const b = {
      B19001_001E: 100,
      B19001_008E: 20, // $35–40k straddle → 20 * 0.517 = 10.34
      B19001_012E: 30, // $60–75k fully above both thresholds
      B19001_017E: 50, // $200k+ fully above both thresholds
    }
    // 8% PTI: (10.34 + 30 + 50) / 100
    expect(incomeQualifiedShare(b, INCOME_QUALIFY_THRESHOLD_ANNUAL)).toBeCloseTo(0.9034, 4)
    // 5% PTI: $008E fully below → 0; 012E lower(60k) ≥ 59865 → full; 017E full → 80/100
    expect(incomeQualifiedShare(b, INCOME_ROBUSTNESS_THRESHOLD_ANNUAL)).toBeCloseTo(0.8, 6)
  })
})

// ---------------------------------------------------------------------------
// screenIncomeForZcta — shares + robustness flag
// ---------------------------------------------------------------------------
describe('screenIncomeForZcta', () => {
  it('flags a ZCTA whose qualified pool collapses under the 5% bound', () => {
    // everyone in the $35–40k gray zone: share8 > 0, share5 = 0 → ratio 0 < 0.5
    const r = screenIncomeForZcta('94901', { B19001_001E: 1000, B19001_008E: 1000 })
    expect(r.income_qualified_share).toBeCloseTo(0.517, 6)
    expect(r.income_qualified_share_pti5).toBe(0)
    expect(r.robustness_flag).toBe(true)
    expect(r.total_households).toBe(1000)
  })

  it('does not flag a high-income ZCTA robust to the PTI assumption', () => {
    const r = screenIncomeForZcta('94957', { B19001_001E: 1000, B19001_017E: 1000 })
    expect(r.income_qualified_share).toBe(1)
    expect(r.income_qualified_share_pti5).toBe(1)
    expect(r.robustness_flag).toBe(false)
  })

  it('never flags (or errors) an empty ZCTA — flag is advisory, never a filter', () => {
    const r = screenIncomeForZcta('00000', {})
    expect(r.income_qualified_share).toBe(0)
    expect(r.robustness_flag).toBe(false)
    expect(r.total_households).toBe(0)
  })
})

describe('B19001_FETCH_VARS', () => {
  it('includes the total plus all 16 bracket variables', () => {
    expect(B19001_FETCH_VARS[0]).toBe('B19001_001E')
    expect(B19001_FETCH_VARS).toHaveLength(17)
    expect(new Set(B19001_FETCH_VARS).size).toBe(17) // no dupes
  })
})
