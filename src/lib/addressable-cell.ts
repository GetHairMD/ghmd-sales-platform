/**
 * Addressable-market cell formula — formula-v2-public-source, Task D.
 *
 *   cell(age,sex)  = adults(age,sex) × income_share × credit_share × prevalence(age,sex)
 *   addressable    = Σ over all age×sex cells
 *
 * income_share is ZCTA-level (income-screen.ts), credit_share is state-level
 * (credit-share.ts), prevalence is per age×sex and is imported from
 * /lib/addressable-market-constants (HAIR_LOSS_PREVALENCE) — Rule 6: prevalence rates
 * are canonical in the constants file; data/prevalence-by-age-sex.json is a generated
 * provenance artifact only, not the compute source.
 */

import { HAIR_LOSS_PREVALENCE, type AgeGenderRate } from '../../lib/addressable-market-constants'

export type Sex = 'male' | 'female'

/** Adult population by age band, split by sex — the cell population inputs. */
export type AdultsByCohort = Record<string, AgeGenderRate>

/** Prevalence proportion (0–1) for an age band + sex. 0 for an unknown band. */
export function prevalenceFor(ageBand: string, sex: Sex): number {
  const row = HAIR_LOSS_PREVALENCE[ageBand]
  return row ? row[sex] : 0
}

/** One cell's addressable contribution. */
export function cellAddressable(
  adults: number,
  incomeShare: number,
  creditShare: number,
  prevalence: number,
): number {
  return Math.max(0, adults) * incomeShare * creditShare * prevalence
}

/**
 * Σ over age×sex cells for one geography.
 * income_share and credit_share are geography-level scalars applied to every cell.
 * Returns the (unrounded) addressable total so callers can aggregate exactly before rounding.
 */
export function addressableFromCohorts(
  adults: AdultsByCohort,
  incomeShare: number,
  creditShare: number,
): number {
  let total = 0
  for (const ageBand of Object.keys(HAIR_LOSS_PREVALENCE)) {
    const cohort = adults[ageBand]
    if (!cohort) continue
    total += cellAddressable(cohort.male, incomeShare, creditShare, prevalenceFor(ageBand, 'male'))
    total += cellAddressable(cohort.female, incomeShare, creditShare, prevalenceFor(ageBand, 'female'))
  }
  return total
}

/**
 * Prevalence-weighted adult pool (Σ adults×prevalence, no income/credit) — useful for
 * reconciliation and for factoring income/credit out of a batch. Equivalent to
 * addressableFromCohorts(adults, 1, 1).
 */
export function prevalenceWeightedPool(adults: AdultsByCohort): number {
  return addressableFromCohorts(adults, 1, 1)
}
