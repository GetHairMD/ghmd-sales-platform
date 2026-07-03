/**
 * Census ACS API client + addressable-market formula runner (formula-v2, CORRECTED).
 *
 *   addressable households = households × income-qualified share × credit-eligible share
 *
 * Affordability model per the methodology memo §2 — no prevalence term (see decision_log
 * "Addressable Market Formula Corrected"). Formula constants/thresholds are imported from
 * /lib/addressable-market-constants.ts — never hardcoded here.
 */

import {
  CENSUS_ACS5_VINTAGE,
  INCOME_QUALIFY_THRESHOLD_ANNUAL,
  B19001_TOTAL_HH_VAR,
} from '../../lib/addressable-market-constants'
import { incomeQualifiedShare, B19001_FETCH_VARS } from './income-screen'
import { creditShareForState } from './credit-share'
import { addressableHouseholds } from './addressable'
import { abbrForStateFips } from './state-fips'
import creditTable from '../../data/experian-credit-share-by-state.json'

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

/** Fetch ACS B19001 household-income counts for one county. Returns variable→value map. */
export async function fetchB19001ForCounty(
  stateFips: string,
  countyFips: string,
  censusApiKey: string,
): Promise<Record<string, number>> {
  const url = new URL(`https://api.census.gov/data/${CENSUS_ACS5_VINTAGE}/acs/acs5`)
  url.searchParams.set('get', B19001_FETCH_VARS.join(','))
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

export interface AddressableDetail {
  households: number
  incomeShare: number
  creditShare: number
  addressable: number
}

/**
 * Corrected v2 formula for one geography.
 * addressable = households × income-qualified share × credit-eligible share.
 * @param vars     ACS B19001 variable→count map (county or ZCTA level)
 * @param stateFips 2-digit state FIPS (for the state credit share; national fallback if unknown)
 * @param incomeThreshold annual HH income floor (default 8% PTI, $37,415)
 */
export function computeAddressableDetail(
  vars: Record<string, number>,
  stateFips: string,
  incomeThreshold: number = INCOME_QUALIFY_THRESHOLD_ANNUAL,
): AddressableDetail {
  const households = vars[B19001_TOTAL_HH_VAR] || 0
  const incomeShare = incomeQualifiedShare(vars, incomeThreshold)
  const creditShare = creditShareForState(abbrForStateFips(stateFips) ?? '', creditTable)
  const addressable = addressableHouseholds(households, incomeShare, creditShare)
  return { households, incomeShare, creditShare, addressable }
}

/** Corrected v2 addressable households (rounded) for one geography. */
export function computeAddressableMarket(vars: Record<string, number>, stateFips: string): number {
  return Math.round(computeAddressableDetail(vars, stateFips).addressable)
}
