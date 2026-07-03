/**
 * Addressable market — formula-v2-public-source (CORRECTED).
 *
 *   addressable households = households × income-qualified share × credit-eligible share
 *
 * This is the affordability model from the methodology memo
 * (data/sources/GHMD_Territory_Methodology_Public_Sources.docx §2). There is NO
 * prevalence / age-sex term — that was a legacy carryover, removed after ground-truth
 * reconciliation (Marin 64,194; national 69.8M @PTI8 / 56.4M @PTI5 match exactly only
 * without it). See ops.decision_log "Addressable Market Formula Corrected — Prevalence
 * Term Removed". The prior cell formula lived in the now-removed addressable-cell.ts;
 * prevalence data is archived under /reference.
 *
 * income_share comes from income-screen.ts (ACS B19001), credit_share from
 * credit-share.ts (Experian-derived, by state).
 */

/**
 * Addressable households for one geography.
 * @param households total households (ACS B19001_001E)
 * @param incomeShare income-qualified share (0–1)
 * @param creditShare credit-eligible share (0–1)
 * @returns unrounded addressable households (round at the presentation layer / after aggregation)
 */
export function addressableHouseholds(
  households: number,
  incomeShare: number,
  creditShare: number,
): number {
  return Math.max(0, households) * incomeShare * creditShare
}
