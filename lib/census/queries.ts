/**
 * Raw ACS5 data pulls — population by age/sex cohort (B01001) and median
 * household income (B19013). No demand coefficients are applied here; this
 * layer returns raw Census counts only. Coefficient application lives in
 * territory-score.ts (decision: decouple Census release cycle from model tuning).
 */

import { censusClient, type CountyGeography } from './client'

export type CohortPopulation = {
  ageBand: string // matches DEMAND_COEFFICIENTS ageBand keys exactly
  male: number
  female: number
}

export type CountyMHHI = {
  fips: string
  mhhi: number
}

/**
 * B01001 ("Sex by Age") variable mapping, verified against
 * https://api.census.gov/data/2022/acs/acs5/variables.json on 2026-06-29.
 *
 * NOTE — variable-code correction: ACS B01001 does NOT expose one variable per
 * 5-year band. The 18–24 and 60–69 ranges are split into finer sub-cohorts, so
 * several target bands must SUM multiple variables:
 *   - 20-24 = "20 years" + "21 years" + "22 to 24 years"
 *   - 60-64 = "60 and 61 years" + "62 to 64 years"
 *   - 65-69 = "65 and 66 years" + "67 to 69 years"
 * The original task mapping (e.g. B01001_007E → 20-24) was off by one sub-band
 * (B01001_007E is "Male 18 and 19 years"). Codes below are the corrected,
 * sub-cohort-summing set. See PR body for the full verification table.
 */
const B01001_COHORTS: ReadonlyArray<{
  ageBand: string
  male: readonly string[]
  female: readonly string[]
}> = [
  { ageBand: '20-24', male: ['B01001_008E', 'B01001_009E', 'B01001_010E'], female: ['B01001_032E', 'B01001_033E', 'B01001_034E'] },
  { ageBand: '25-29', male: ['B01001_011E'], female: ['B01001_035E'] },
  { ageBand: '30-34', male: ['B01001_012E'], female: ['B01001_036E'] },
  { ageBand: '35-39', male: ['B01001_013E'], female: ['B01001_037E'] },
  { ageBand: '40-44', male: ['B01001_014E'], female: ['B01001_038E'] },
  { ageBand: '45-49', male: ['B01001_015E'], female: ['B01001_039E'] },
  { ageBand: '50-54', male: ['B01001_016E'], female: ['B01001_040E'] },
  { ageBand: '55-59', male: ['B01001_017E'], female: ['B01001_041E'] },
  { ageBand: '60-64', male: ['B01001_018E', 'B01001_019E'], female: ['B01001_042E', 'B01001_043E'] },
  { ageBand: '65-69', male: ['B01001_020E', 'B01001_021E'], female: ['B01001_044E', 'B01001_045E'] },
  { ageBand: '70-74', male: ['B01001_022E'], female: ['B01001_046E'] },
  { ageBand: '75-79', male: ['B01001_023E'], female: ['B01001_047E'] },
]

const MHHI_VARIABLE = 'B19013_001E'

/**
 * Split a 5-digit FIPS code into state (first 2) + county (last 3).
 * @throws Error if `fips` is not exactly 5 numeric digits.
 */
export function splitFips(fips: string): CountyGeography {
  if (!/^\d{5}$/.test(fips)) {
    throw new Error(`Invalid FIPS code: expected exactly 5 digits, got "${fips}"`)
  }
  return { state: fips.slice(0, 2), county: fips.slice(2) }
}

/** Parse a raw Census string value to a non-negative integer (0 on null/NaN). */
function toCount(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  // Census uses negative jam/annotation codes (e.g. -666666666) for no-data.
  return Number.isNaN(n) || n < 0 ? 0 : n
}

/**
 * Pull male + female population for each 5-year age band 20–79 in one county.
 * Returns one CohortPopulation per band, summing sub-cohort variables.
 */
export async function getCohortPopulationByCounty(fips: string): Promise<CohortPopulation[]> {
  const geo = splitFips(fips)
  const variables = B01001_COHORTS.flatMap((c) => [...c.male, ...c.female])
  const data = await censusClient.fetchCounty(variables, geo)

  return B01001_COHORTS.map((cohort) => ({
    ageBand: cohort.ageBand,
    male: cohort.male.reduce((sum, v) => sum + toCount(data[v]), 0),
    female: cohort.female.reduce((sum, v) => sum + toCount(data[v]), 0),
  }))
}

/** Pull median household income (B19013_001E) for one county. */
export async function getMHHIByCounty(fips: string): Promise<CountyMHHI> {
  const geo = splitFips(fips)
  const data = await censusClient.fetchCounty([MHHI_VARIABLE], geo)
  return { fips, mhhi: toCount(data[MHHI_VARIABLE]) }
}
