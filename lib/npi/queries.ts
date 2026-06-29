/**
 * NPI Registry physician-density query layer.
 *
 * Read-only enrichment, mirroring lib/census/queries.ts: raw counts only — no
 * coefficients, weighting, or scoring (those live in the scoring layer and are
 * defined later by Chat). NPI density is an ADDITIVE signal, not a multiplier.
 *
 * Resilience contract: this layer NEVER throws. The CMS NPI Registry is an
 * external dependency that must not be able to break territory scoring — on any
 * unmapped geography, HTTP error, or malformed response it logs and returns 0
 * so the Census-derived signals still score.
 */

import { npiClient, NPI_TAXONOMY_HAIR } from './client'

/**
 * 2-digit state FIPS → USPS two-letter abbreviation. All 50 states + DC.
 * Source: ANSI / FIPS 5-2 state codes. (Non-state territories — PR 72, etc. —
 * are intentionally omitted; an unmapped code degrades to a count of 0.)
 */
const STATE_FIPS_TO_ABBR: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY',
}

/**
 * Physician count for the county's STATE, matching {@link NPI_TAXONOMY_HAIR}.
 *
 * Sprint 1 approximation — the CMS NPI Registry API cannot filter by county
 * FIPS, so we query at the STATE level only (first 2 digits of the FIPS). City
 * derivation from FIPS is deliberately out of scope for Sprint 1; finer
 * county / drive-time geography arrives with the Mapbox isochrone integration.
 *
 * The returned count is CAPPED at 200 — the NPI Registry returns at most 200
 * results per request, so `result_count` reflects the page, not the true total
 * for high-density states. Acceptable for an additive Sprint 1 signal;
 * pagination is deferred to Sprint 2 hardening.
 *
 * Never throws: returns 0 on invalid FIPS, unmapped state, HTTP error, or parse
 * failure (logged in every case).
 */
export async function getPhysicianCountByCounty(fips: string): Promise<number> {
  if (!/^\d{5}$/.test(fips)) {
    console.error(`[npi] invalid FIPS "${fips}" — expected 5 digits; returning 0`)
    return 0
  }

  const stateAbbr = STATE_FIPS_TO_ABBR[fips.slice(0, 2)]
  if (!stateAbbr) {
    console.error(`[npi] unmapped state FIPS "${fips.slice(0, 2)}" (from "${fips}"); returning 0`)
    return 0
  }

  try {
    const { result_count } = await npiClient(stateAbbr, NPI_TAXONOMY_HAIR)
    return result_count
  } catch (err) {
    console.error(`[npi] physician count lookup failed for ${stateAbbr} (fips ${fips}); returning 0:`, err)
    return 0
  }
}
