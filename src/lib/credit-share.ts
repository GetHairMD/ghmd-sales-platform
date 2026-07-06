/**
 * Credit screen — formula-v2-public-source, Task C.
 *
 * Credit-qualified household share = share of consumers with FICO ≥ 670 (prime+),
 * Experian September 2025. Per-state overrides come from
 * /data/experian-credit-share-by-state.json; any state without an override falls
 * back to the national figure (EXPERIAN_NATIONAL_CREDIT_SHARE = 0.704).
 *
 * Thresholds/national fallback are imported from /lib/addressable-market-constants (Rule 6).
 */

import { EXPERIAN_NATIONAL_CREDIT_SHARE } from '../../lib/addressable-market-constants'

export interface ExperianCreditShareFile {
  provenance: {
    source: string
    as_of: string
    metric: string
    national_share: number
    url?: string
    notes?: string
  }
  /** True until the real Sept-2025 per-state table has been dropped in. */
  state_data_pending: boolean
  /** Two-letter USPS state code → FICO≥670 share (0–1). Empty ⇒ national fallback everywhere. */
  states: Record<string, number>
}

/**
 * Credit-qualified share for a state (0–1). Returns the per-state Experian override
 * when present, else the national fallback. `state` is a 2-letter USPS code (any case).
 */
export function creditShareForState(
  state: string,
  table: Pick<ExperianCreditShareFile, 'states'>,
): number {
  const key = (state || '').trim().toUpperCase()
  const override = table.states?.[key]
  return typeof override === 'number' ? override : EXPERIAN_NATIONAL_CREDIT_SHARE
}

/**
 * Household-weighted credit-eligible share for a polygon that may span several states
 * (v3, resolved decision #89 flag #4 — "population/household-weighted blend across the
 * state-clipped portions of the isochrone"). Extends creditShareForState() without
 * modifying it: each state's per-state Experian share is weighted by that state's
 * apportioned household count inside the polygon, then summed.
 *
 *   blended = Σ_state ( households_state / Σ households ) × creditShareForState(state)
 *
 * - `stateHouseholds` maps a 2-letter USPS code (any case) → apportioned households
 *   inside the polygon for that state (from the §3.2 block-weighted apportionment).
 * - A single-state polygon collapses to exactly creditShareForState(thatState).
 * - Empty / all-zero input → national fallback (EXPERIAN_NATIONAL_CREDIT_SHARE), same
 *   as an unknown single state, so the engine never divides by zero.
 */
export function blendCreditShareByHouseholds(
  stateHouseholds: Record<string, number>,
  table: Pick<ExperianCreditShareFile, 'states'>,
): number {
  const entries = Object.entries(stateHouseholds)
    .map(([state, hh]) => [state, Math.max(0, hh)] as const)
    .filter(([, hh]) => hh > 0)

  const totalHH = entries.reduce((sum, [, hh]) => sum + hh, 0)
  if (totalHH <= 0) return EXPERIAN_NATIONAL_CREDIT_SHARE

  return entries.reduce(
    (acc, [state, hh]) => acc + (hh / totalHH) * creditShareForState(state, table),
    0,
  )
}

/** Validate + normalize a parsed credit-share file. Throws on structural problems. */
export function loadCreditShareFile(parsed: unknown): ExperianCreditShareFile {
  const file = parsed as ExperianCreditShareFile
  if (!file || typeof file !== 'object' || typeof file.states !== 'object' || file.states === null) {
    throw new Error('Experian credit share: malformed file (expected { provenance, states: {} })')
  }
  return file
}
