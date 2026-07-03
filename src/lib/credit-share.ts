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

/** Validate + normalize a parsed credit-share file. Throws on structural problems. */
export function loadCreditShareFile(parsed: unknown): ExperianCreditShareFile {
  const file = parsed as ExperianCreditShareFile
  if (!file || typeof file !== 'object' || typeof file.states !== 'object' || file.states === null) {
    throw new Error('Experian credit share: malformed file (expected { provenance, states: {} })')
  }
  return file
}
