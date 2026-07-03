/**
 * Census ACS API client + addressable market formula runner.
 * Formula constants are imported from /lib/addressable-market-constants.ts — never hardcoded here.
 */

import {
  HAIR_LOSS_PREVALENCE,
  INCOME_BANDS,
  FINANCING_TAKEUP_RATE,
} from '../../lib/addressable-market-constants'

// B01001 variable → age cohort mapping (Census ACS 5-year)
const AGE_COHORT_VARS: Record<string, { male: string[]; female: string[] }> = {
  '20-24': { male: ['B01001_008E', 'B01001_009E', 'B01001_010E'], female: ['B01001_032E', 'B01001_033E', 'B01001_034E'] },
  '25-29': { male: ['B01001_011E'], female: ['B01001_035E'] },
  '30-34': { male: ['B01001_012E'], female: ['B01001_036E'] },
  '35-39': { male: ['B01001_013E'], female: ['B01001_037E'] },
  '40-44': { male: ['B01001_014E'], female: ['B01001_038E'] },
  '45-49': { male: ['B01001_015E'], female: ['B01001_039E'] },
  '50-54': { male: ['B01001_016E'], female: ['B01001_040E'] },
  '55-59': { male: ['B01001_017E'], female: ['B01001_041E'] },
  '60-64': { male: ['B01001_018E', 'B01001_019E'], female: ['B01001_042E', 'B01001_043E'] },
  '65-69': { male: ['B01001_020E', 'B01001_021E'], female: ['B01001_044E', 'B01001_045E'] },
  '70-74': { male: ['B01001_022E'], female: ['B01001_046E'] },
  '75-79': { male: ['B01001_023E'], female: ['B01001_047E'] },
  '80-84': { male: ['B01001_024E'], female: ['B01001_048E'] },
  '85+':   { male: ['B01001_025E'], female: ['B01001_049E'] },
}

const ALL_ACS_VARS: string[] = [
  'B01001_001E', // total population
  ...Object.values(AGE_COHORT_VARS).flatMap(v => [...v.male, ...v.female]),
  ...INCOME_BANDS.flatMap(b => b.acsVariables),
]

const UNIQUE_ACS_VARS = Array.from(new Set(ALL_ACS_VARS))

export interface FipsResult {
  stateFips: string
  countyFips: string
}

/** Convert lat/lng to state + county FIPS via Census Geocoder. */
export async function geoToFips(lat: number, lng: number): Promise<FipsResult> {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates')
  url.searchParams.set('x', String(lng))
  url.searchParams.set('y', String(lat))
  url.searchParams.set('benchmark', 'Public_AR_Current')
  url.searchParams.set('vintage', 'Current_Current')
  url.searchParams.set('format', 'json')

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`Census geocoder error: ${res.status}`)

  const json = await res.json()
  const county = json?.result?.geographies?.Counties?.[0]
  if (!county) throw new Error(`No county found for (${lat}, ${lng})`)

  return { stateFips: county.STATE, countyFips: county.COUNTY }
}

/** Fetch Census ACS 5-year variables for one county. Returns variable→value map. */
export async function fetchAcsForCounty(
  stateFips: string,
  countyFips: string,
  censusApiKey: string,
): Promise<Record<string, number>> {
  const url = new URL('https://api.census.gov/data/2022/acs/acs5')
  url.searchParams.set('get', UNIQUE_ACS_VARS.join(','))
  url.searchParams.set('for', `county:${countyFips}`)
  url.searchParams.set('in', `state:${stateFips}`)
  url.searchParams.set('key', censusApiKey)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`Census ACS error: ${res.status}`)

  const rows: string[][] = await res.json()
  if (!rows || rows.length < 2) throw new Error('Census ACS returned empty data')

  const headers = rows[0]
  const values = rows[1]
  const result: Record<string, number> = {}
  headers.forEach((h, i) => {
    const n = parseInt(values[i], 10)
    if (!isNaN(n)) result[h] = n
  })
  return result
}

/**
 * Apply the GHMD addressable market formula to a Census ACS variable map.
 *
 * ⚠️ TRANSITIONAL (formula-v2-public-source, Task A). The legacy propensity-to-act
 * factor and the housing-cost / cost-of-living multiplier (Census median-housing
 * table) have been removed per the locked v2 methodology (decision_log rows 37, 39,
 * 40). This interim body computes a prevalence-weighted pool against the legacy
 * income bands only, so the module keeps compiling; it is NOT the shipping formula.
 *
 * Rebuilt across:
 *   Task B — income-qualified share (ACS B19001 ZCTA, ≥ $37,415, straddle interp)
 *   Task C — credit-qualified share (Experian FICO≥670 by state)
 *   Task D — peer-reviewed prevalence(age,sex) cells; Σ cells = addressable
 *   Task F — penetration scenarios (0.005 / 0.01 / 0.02)
 *   Task G — end-to-end reconciliation (national / Marin QA targets)
 */
export function computeAddressableMarket(vars: Record<string, number>): number {
  const totalPop = vars['B01001_001E'] || 1

  // Interim: prevalence-only pool fraction across age/sex cohorts (no propensity).
  let prevalencePoolFraction = 0
  for (const [cohort, cohortVars] of Object.entries(AGE_COHORT_VARS)) {
    const malePop = cohortVars.male.reduce((s, v) => s + (vars[v] || 0), 0)
    const femalePop = cohortVars.female.reduce((s, v) => s + (vars[v] || 0), 0)
    const prev = HAIR_LOSS_PREVALENCE[cohort]
    prevalencePoolFraction +=
      (malePop / totalPop) * prev.male +
      (femalePop / totalPop) * prev.female
  }

  // Interim: sum across legacy income bands (no housing-cost/COL adjustment).
  const AVG_HOUSEHOLD_SIZE = 2.5
  let addressable = 0
  for (const band of INCOME_BANDS) {
    const households = band.acsVariables.reduce((s, v) => s + (vars[v] || 0), 0)
    const persons = households * AVG_HOUSEHOLD_SIZE
    const effectiveRate = band.baseRate * (band.financingApplies ? FINANCING_TAKEUP_RATE : 1.0)
    addressable += persons * prevalencePoolFraction * effectiveRate
  }

  return Math.round(addressable)
}
