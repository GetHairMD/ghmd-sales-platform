import { describe, expect, it } from 'vitest'
import {
  prevalenceFor,
  cellAddressable,
  addressableFromCohorts,
  prevalenceWeightedPool,
  type AdultsByCohort,
} from '../addressable-cell'
import { HAIR_LOSS_PREVALENCE } from '../../../lib/addressable-market-constants'

describe('prevalenceFor', () => {
  it('reads proportions from the canonical constant (Rule 6 source of truth)', () => {
    expect(prevalenceFor('25-29', 'male')).toBe(HAIR_LOSS_PREVALENCE['25-29'].male)
    expect(prevalenceFor('25-29', 'female')).toBe(HAIR_LOSS_PREVALENCE['25-29'].female)
  })
  it('returns 0 for an unknown age band', () => {
    expect(prevalenceFor('00-04', 'male')).toBe(0)
  })
})

describe('cellAddressable', () => {
  it('multiplies adults × income × credit × prevalence', () => {
    // 1000 adults, 50% income-qual, 70% credit-qual, 20% prevalence → 70
    expect(cellAddressable(1000, 0.5, 0.7, 0.2)).toBeCloseTo(70, 6)
  })
  it('clamps negative adults to 0', () => {
    expect(cellAddressable(-10, 0.5, 0.7, 0.2)).toBe(0)
  })
})

describe('addressableFromCohorts', () => {
  it('sums a single populated cell correctly', () => {
    // only 25-29 males: prevalence 0.20 (from constant); 10,000 adults, income 0.5, credit 0.7
    const adults: AdultsByCohort = { '25-29': { male: 10_000, female: 0 } }
    const expected = 10_000 * 0.5 * 0.7 * HAIR_LOSS_PREVALENCE['25-29'].male
    expect(addressableFromCohorts(adults, 0.5, 0.7)).toBeCloseTo(expected, 6)
  })

  it('factors income/credit out linearly (Σ over cells)', () => {
    const adults: AdultsByCohort = {
      '25-29': { male: 10_000, female: 8_000 },
      '50-54': { male: 5_000, female: 6_000 },
    }
    const pool = prevalenceWeightedPool(adults) // income=credit=1
    // full formula == pool × income × credit (scalars factor out)
    expect(addressableFromCohorts(adults, 0.6, 0.704)).toBeCloseTo(pool * 0.6 * 0.704, 6)
  })

  it('ignores age bands not present in the cohort input', () => {
    const adults: AdultsByCohort = { '40-44': { male: 1_000, female: 1_000 } }
    const expected =
      1_000 * HAIR_LOSS_PREVALENCE['40-44'].male + 1_000 * HAIR_LOSS_PREVALENCE['40-44'].female
    expect(prevalenceWeightedPool(adults)).toBeCloseTo(expected, 6)
  })

  it('returns 0 for empty cohorts', () => {
    expect(addressableFromCohorts({}, 0.5, 0.7)).toBe(0)
  })
})
