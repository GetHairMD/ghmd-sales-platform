/**
 * Purchasing Power Index (PPI) — a relative ranking signal for territory scoring.
 *
 * Two formulas (Decision 3):
 *   Base:          PPI = medianHouseholdIncome / (RPP / 100)
 *   Rent-burdened: PPI = (medianHouseholdIncome / (RPP / 100)) × (1 − rentBurdenPct)
 *
 * RPP = BEA Regional Price Parities (100 = national average). RPP is fetched
 * upstream in the Census module in Sprint 2 — it is NOT fetched here. All inputs
 * arrive as arguments; this module makes no live API calls.
 *
 * rentBurdenPct = share of households paying 35%+ of income on rent
 * (ACS variable B25070_010E), expressed as a 0–1 fraction.
 *
 * PPI is a RELATIVE RANKING signal only — never a direct affordability gate.
 * See PPI_SIGNAL_NOTE.
 */

export type PpiInputs = {
  medianHouseholdIncome: number
  rpp: number
  rentBurdenPct?: number
}

/**
 * Plain-language documentation of what PPI is — and, importantly, what it is
 * not. Surfaced anywhere PPI is reported so downstream consumers do not treat
 * it as a hard affordability threshold.
 */
export const PPI_SIGNAL_NOTE =
  'PPI is a relative ranking signal used to compare purchasing power across ' +
  'territories — NOT a direct affordability gate. It approximates real local ' +
  'purchasing power as median household income adjusted by BEA Regional Price ' +
  'Parities (RPP = 100 at the national average), optionally discounted by the ' +
  'rent-burdened household share. Use it to rank markets relative to one ' +
  'another, never to qualify or disqualify a single territory in isolation.'

/** True only for an actual finite number (rejects undefined, NaN, ±Infinity). */
function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

/**
 * Compute the Purchasing Power Index for one territory.
 *
 * Uses the rent-burdened formula when `rentBurdenPct` is supplied and within
 * [0, 1]; otherwise the base formula. An out-of-range `rentBurdenPct` falls back
 * to the base formula rather than throwing.
 *
 * Never throws — returns 0 on any invalid or missing input (non-finite income,
 * negative income, RPP ≤ 0, etc.), mirroring the no-data convention used
 * elsewhere in the Census layer (see `toCount` in queries.ts).
 */
export function computePpi(inputs: PpiInputs): number {
  if (!inputs) return 0
  const { medianHouseholdIncome, rpp, rentBurdenPct } = inputs

  if (!isFiniteNumber(medianHouseholdIncome) || medianHouseholdIncome < 0) return 0
  // RPP is a parity index — must be strictly positive to divide by.
  if (!isFiniteNumber(rpp) || rpp <= 0) return 0

  const base = medianHouseholdIncome / (rpp / 100)

  if (isFiniteNumber(rentBurdenPct) && rentBurdenPct >= 0 && rentBurdenPct <= 1) {
    return base * (1 - rentBurdenPct)
  }

  return base
}
