/**
 * Census ACS API client + addressable market formula runner.
 * Formula constants are imported from /lib/addressable-market-constants.ts — never hardcoded here.
 */

import {
  HAIR_LOSS_PREVALENCE,
  PROPENSITY_TO_ACT,
  INCOME_BANDS,
  FINANCING_TAKEUP_RATE,
  CENSUS_HOUSING_COST_VAR,
  housingCostMultiplier,
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
  CENSUS_HOUSING_COST_VAR,
]

const UNIQUE_ACS_VARS = [...new Set(ALL_ACS_VARS)]

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
 * Formula:
 *   hairLossFraction = Σ(cohort) [(malePop/totalPop)×prevalence.male×propensity.male
 *                               + (femalePop/totalPop)×prevalence.female×propensity.female]
 *
 *   addressable = Σ(incomeBand) [
 *     (householdsInBand × AVG_HH_SIZE) × hairLossFraction
 *     × housingCostMultiplier(band.baseRate, medianHousingCost, band.midpointIncome)
 *     × (band.financingApplies ? FINANCING_TAKEUP_RATE : 1.0)
 *   ]
 */
export function computeAddressableMarket(vars: Record<string, number>): number {
  const totalPop = vars['B01001_001E'] || 1
  const medianMonthlyHousingCost = vars[CENSUS_HOUSING_COST_VAR] || 0

  // Step 1: Hair loss × propensity fraction across age cohorts
  let hairLossPoolFraction = 0
  for (const [cohort, cohortVars] of Object.entries(AGE_COHORT_VARS)) {
    const malePop = cohortVars.male.reduce((s, v) => s + (vars[v] || 0), 0)
    const femalePop = cohortVars.female.reduce((s, v) => s + (vars[v] || 0), 0)
    const prev = HAIR_LOSS_PREVALENCE[cohort]
    const prop = PROPENSITY_TO_ACT[cohort]
    hairLossPoolFraction +=
      (malePop / totalPop) * prev.male * prop.male +
      (femalePop / totalPop) * prev.female * prop.female
  }

  // Step 2: Sum across income bands
  const AVG_HOUSEHOLD_SIZE = 2.5
  let addressable = 0
  for (const band of INCOME_BANDS) {
    const households = band.acsVariables.reduce((s, v) => s + (vars[v] || 0), 0)
    const persons = households * AVG_HOUSEHOLD_SIZE
    const adjustedRate = housingCostMultiplier(
      band.baseRate,
      medianMonthlyHousingCost,
      band.midpointIncome,
    )
    const effectiveRate = adjustedRate * (band.financingApplies ? FINANCING_TAKEUP_RATE : 1.0)
    addressable += persons * hairLossPoolFraction * effectiveRate
  }

  return Math.round(addressable)
}
