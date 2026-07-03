/**
 * Income screen — formula-v2-public-source, Task B.
 *
 * Computes the income-qualified household share for a ZCTA from ACS Table B19001,
 * using the Affordability Anchor V2 threshold ($37,415 @ 8% PTI, decision_log #37)
 * with LINEAR INTERPOLATION IN THE STRADDLING BRACKET ONLY. Also computes the
 * 5%-PTI robustness bound ($59,865) and an advisory robustness_flag.
 *
 * The flag NEVER filters — a flagged ZCTA stays in the addressable pool.
 * All thresholds/brackets are imported from /lib/addressable-market-constants (Rule 6).
 */

import {
  B19001_INCOME_BRACKETS,
  B19001_TOTAL_HH_VAR,
  INCOME_QUALIFY_THRESHOLD_ANNUAL,
  INCOME_ROBUSTNESS_THRESHOLD_ANNUAL,
  ROBUSTNESS_SHARE_RATIO_FLOOR,
  CENSUS_ACS5_VINTAGE,
} from '../../lib/addressable-market-constants'

/**
 * Fraction of a single bracket [lower, upper) whose income is at or above `threshold`.
 *   - threshold ≤ lower           → 1  (entire bracket qualifies)
 *   - threshold ≥ upper (finite)  → 0  (none qualifies)
 *   - lower < threshold < upper   → (upper − threshold) / (upper − lower)  (linear)
 * The open top bracket (upper = Infinity) qualifies fully for any finite threshold
 * at or below its lower bound, and is treated as fully qualifying otherwise.
 */
export function bracketQualifyingFraction(
  lower: number,
  upper: number,
  threshold: number,
): number {
  if (threshold <= lower) return 1
  if (!isFinite(upper)) return 1 // open top band; every threshold we use sits below 200k
  if (threshold >= upper) return 0
  return (upper - threshold) / (upper - lower)
}

/**
 * Income-qualified household share for a ZCTA at a given annual-income threshold.
 * Interpolates the single straddling bracket; brackets fully below contribute 0,
 * brackets fully above contribute their full household count.
 *
 * @param b19001 map of B19001 variable → household count (estimate)
 * @param threshold annual HH income floor (USD)
 * @returns share in [0, 1]; 0 when total households is 0/unknown
 */
export function incomeQualifiedShare(
  b19001: Record<string, number>,
  threshold: number,
): number {
  const totalHH = b19001[B19001_TOTAL_HH_VAR] || 0
  if (totalHH <= 0) return 0

  let qualifiedHH = 0
  for (const bracket of B19001_INCOME_BRACKETS) {
    const count = b19001[bracket.variable] || 0
    if (count <= 0) continue
    qualifiedHH += count * bracketQualifyingFraction(bracket.lower, bracket.upper, threshold)
  }

  return qualifiedHH / totalHH
}

export interface IncomeScreenResult {
  zcta: string
  /** Income-qualified HH share at 8% PTI ($37,415) — the shipping figure. */
  income_qualified_share: number
  /** Income-qualified HH share at the 5% PTI robustness bound ($59,865). */
  income_qualified_share_pti5: number
  /** Advisory: qualification leans on the $37,415–$59,865 gray zone. Never filters. */
  robustness_flag: boolean
  /** Total households (B19001_001E) — for weighting/aggregation. */
  total_households: number
}

/**
 * Screen one ZCTA's B19001 data into qualified shares + robustness flag.
 */
export function screenIncomeForZcta(
  zcta: string,
  b19001: Record<string, number>,
): IncomeScreenResult {
  const share8 = incomeQualifiedShare(b19001, INCOME_QUALIFY_THRESHOLD_ANNUAL)
  const share5 = incomeQualifiedShare(b19001, INCOME_ROBUSTNESS_THRESHOLD_ANNUAL)

  // Flag when the majority of 8%-PTI-qualified HH would drop out at the 5%-PTI bound.
  const robustness_flag =
    share8 > 0 && share5 / share8 < ROBUSTNESS_SHARE_RATIO_FLOOR

  return {
    zcta,
    income_qualified_share: share8,
    income_qualified_share_pti5: share5,
    robustness_flag,
    total_households: b19001[B19001_TOTAL_HH_VAR] || 0,
  }
}

/** All B19001 variables the income screen needs to fetch. */
export const B19001_FETCH_VARS: string[] = [
  B19001_TOTAL_HH_VAR,
  ...B19001_INCOME_BRACKETS.map(b => b.variable),
]

/**
 * Fetch ACS B19001 household-income counts for one ZCTA (geography-join only —
 * ZCTA→territory association comes from the HUD crosswalk, see hud-crosswalk.ts).
 * Uses the latest available ACS 5-year vintage (CENSUS_ACS5_VINTAGE).
 */
export async function fetchB19001ForZcta(
  zcta: string,
  censusApiKey: string,
): Promise<Record<string, number>> {
  const url = new URL(`https://api.census.gov/data/${CENSUS_ACS5_VINTAGE}/acs/acs5`)
  url.searchParams.set('get', B19001_FETCH_VARS.join(','))
  url.searchParams.set('for', `zip code tabulation area:${zcta}`)
  url.searchParams.set('key', censusApiKey)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) throw new Error(`Census B19001 error for ZCTA ${zcta}: ${res.status}`)

  const rows: string[][] = await res.json()
  if (!rows || rows.length < 2) throw new Error(`Census B19001 returned empty data for ZCTA ${zcta}`)

  const headers = rows[0]
  const values = rows[1]
  const result: Record<string, number> = {}
  headers.forEach((h, i) => {
    const n = parseInt(values[i], 10)
    if (!isNaN(n)) result[h] = n
  })
  return result
}
