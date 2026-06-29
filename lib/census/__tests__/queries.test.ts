import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCohortPopulationByCounty,
  getMHHIByCounty,
  splitFips,
  type CohortPopulation,
} from '../queries'
import { computeDemandByAgeBand, mhhiTier } from '../territory-score'

// ---------------------------------------------------------------------------
// FIPS splitting
// ---------------------------------------------------------------------------
describe('splitFips', () => {
  it('splits a valid 5-digit FIPS into state (2) + county (3)', () => {
    expect(splitFips('48453')).toEqual({ state: '48', county: '453' })
    expect(splitFips('06037')).toEqual({ state: '06', county: '037' })
  })

  it.each(['', '4845', '484530', '4845x', 'abcde', '48 53'])(
    'throws on invalid FIPS input %p',
    (bad) => {
      expect(() => splitFips(bad)).toThrow(/Invalid FIPS/)
    },
  )
})

// ---------------------------------------------------------------------------
// MHHI tier bucketing — boundary values
// ---------------------------------------------------------------------------
describe('mhhiTier', () => {
  it('buckets boundary values per MHHI_TIERS (<60k / 60k–100k / >100k)', () => {
    expect(mhhiTier(59_999)).toBe('low')
    expect(mhhiTier(60_000)).toBe('mid')
    expect(mhhiTier(100_000)).toBe('mid')
    expect(mhhiTier(100_001)).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Demand computation — known inputs
// ---------------------------------------------------------------------------
describe('computeDemandByAgeBand', () => {
  it('applies coefficients for two cohorts against known inputs', () => {
    const cohorts: CohortPopulation[] = [
      { ageBand: '20-24', male: 1000, female: 1000 },
      { ageBand: '50-54', male: 1000, female: 1000 },
    ]
    const demand = computeDemandByAgeBand(cohorts)

    // 20-24: male 1000 × 0.05 × 0.50 = 25 ; female 1000 × 0.005 × 0.90 = 4.5
    expect(demand[0]).toEqual({ ageBand: '20-24', estimatedDemandMale: 25, estimatedDemandFemale: 4.5 })
    // 50-54: male 1000 × 0.45 × 0.50 = 225 ; female 1000 × 0.25 × 0.90 = 225
    expect(demand[1]).toEqual({ ageBand: '50-54', estimatedDemandMale: 225, estimatedDemandFemale: 225 })
  })

  it('skips cohorts with no matching coefficient (80+) without throwing', () => {
    const cohorts: CohortPopulation[] = [
      { ageBand: '20-24', male: 100, female: 100 },
      { ageBand: '85+', male: 500, female: 500 },
    ]
    const demand = computeDemandByAgeBand(cohorts)
    expect(demand.map((d) => d.ageBand)).toEqual(['20-24'])
  })
})

// ---------------------------------------------------------------------------
// Query functions — Census HTTP fully mocked (no live API)
// ---------------------------------------------------------------------------
describe('Census queries (mocked HTTP)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** Echoes back the requested `get` variables with a fixed value each. */
  function stubCensus(value: string) {
    process.env.CENSUS_API_KEY = 'test-key'
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(input.toString())
      const vars = (url.searchParams.get('get') ?? '').split(',').filter(Boolean)
      const values = vars.map(() => value)
      return new Response(JSON.stringify([vars, values]), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('getCohortPopulationByCounty sums sub-cohort variables per band', async () => {
    const fetchMock = stubCensus('100')
    const cohorts = await getCohortPopulationByCounty('48453')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    // 20-24 sums 3 male + 3 female sub-cohort variables → 300 each.
    expect(cohorts.find((c) => c.ageBand === '20-24')).toEqual({ ageBand: '20-24', male: 300, female: 300 })
    // 25-29 is a single variable each → 100 each.
    expect(cohorts.find((c) => c.ageBand === '25-29')).toEqual({ ageBand: '25-29', male: 100, female: 100 })
    // 12 bands, 20-24 through 75-79.
    expect(cohorts).toHaveLength(12)
  })

  it('getMHHIByCounty parses the median household income value', async () => {
    stubCensus('85000')
    const result = await getMHHIByCounty('48453')
    expect(result).toEqual({ fips: '48453', mhhi: 85000 })
  })

  it('treats Census no-data jam codes (negative) as 0', async () => {
    stubCensus('-666666666')
    const result = await getMHHIByCounty('48453')
    expect(result.mhhi).toBe(0)
  })
})
