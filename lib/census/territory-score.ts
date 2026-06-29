/**
 * Territory signal orchestration. Pulls raw cohort + MHHI data, applies the
 * proprietary DEMAND_COEFFICIENTS, and returns a TerritorySignals object.
 *
 * This is a read-only enrichment layer feeding Tier 1 AI pre-scoring later; it
 * does NOT compute or write operator scores.
 */

import { DEMAND_COEFFICIENTS, MHHI_TIERS } from './constants'
import { computePpi } from './ppi'
import {
  getCohortPopulationByCounty,
  getMHHIByCounty,
  type CohortPopulation,
} from './queries'
import { getPhysicianCountByCounty } from '../npi/queries'

// Placeholder weight for PPI's contribution to the future composite territory
// score. Higher PPI = stronger market, so this coefficient is positive once set.
// Exported so future scoring code consumes it as the single source of truth.
// TODO: calibrate in future session — do not invent a weight. At 0.0 the PPI
// signal is carried through the pipeline but is inert in any weighted total.
export const PPI_WEIGHT = 0.0

export type AgeBandDemand = {
  ageBand: string
  estimatedDemandMale: number
  estimatedDemandFemale: number
}

export type TerritorySignals = {
  fips: string
  totalEstimatedDemandMale: number
  totalEstimatedDemandFemale: number
  totalEstimatedDemand: number
  demandByAgeBand: AgeBandDemand[] // cohort-level breakdown, retained for debugging
  mhhi: number
  mhhiTier: 'low' | 'mid' | 'high'
  ppi: number // Purchasing Power Index — relative ranking signal (see ppi.ts)
  npiDensity: number // raw physician count from NPI Registry; additive signal, unweighted
}

/** Bucket MHHI into low (<$60k) / mid ($60k–$100k inclusive) / high (>$100k). */
export function mhhiTier(mhhi: number): 'low' | 'mid' | 'high' {
  if (mhhi < MHHI_TIERS.low) return 'low'
  if (mhhi > MHHI_TIERS.high) return 'high'
  return 'mid'
}

/**
 * Apply demand coefficients to raw cohort populations.
 *   estimatedDemandMale   = male   × hairIssueRateMale   × propensityToActMale
 *   estimatedDemandFemale = female × hairIssueRateFemale × propensityToActFemale
 * Cohorts with no matching coefficient (e.g. 80+) are skipped silently.
 */
export function computeDemandByAgeBand(cohorts: CohortPopulation[]): AgeBandDemand[] {
  const result: AgeBandDemand[] = []
  for (const cohort of cohorts) {
    const coef = DEMAND_COEFFICIENTS.find((c) => c.ageBand === cohort.ageBand)
    if (!coef) continue // no coefficient for this band — skip, do not throw
    result.push({
      ageBand: cohort.ageBand,
      estimatedDemandMale: cohort.male * coef.hairIssueRateMale * coef.propensityToActMale,
      estimatedDemandFemale: cohort.female * coef.hairIssueRateFemale * coef.propensityToActFemale,
    })
  }
  return result
}

/**
 * Orchestrate the territory signal computation for a 5-digit county FIPS.
 * Sequential by design — no parallel fan-out in this scaffold.
 */
export async function computeTerritorySignals(fips: string): Promise<TerritorySignals> {
  const cohorts = await getCohortPopulationByCounty(fips)
  const { mhhi } = await getMHHIByCounty(fips)
  // Physician density (NPI Registry). Raw count only — never throws; degrades to
  // 0 so Census signals still score if NPI is unavailable. Weighting is defined
  // by Chat in a future session.
  const npiDensity = await getPhysicianCountByCounty(fips)

  const demandByAgeBand = computeDemandByAgeBand(cohorts)
  const totalEstimatedDemandMale = demandByAgeBand.reduce((s, d) => s + d.estimatedDemandMale, 0)
  const totalEstimatedDemandFemale = demandByAgeBand.reduce((s, d) => s + d.estimatedDemandFemale, 0)

  // RPP (BEA Regional Price Parities) and rent-burden share (ACS B25070_010E)
  // are not yet fetched in this scaffold — they arrive via the Census module in
  // Sprint 2. Until then rpp = 0, so computePpi() returns 0 (no divide-by-zero)
  // and rentBurdenPct is omitted. Wiring the upstream fetch flips PPI live with
  // no change to this call site.
  const rpp = 0 // TODO: Sprint 2 — source from BEA Regional Price Parities upstream
  const ppi = computePpi({ medianHouseholdIncome: mhhi, rpp })
  // Future composite score will add (ppi × PPI_WEIGHT); inert at PPI_WEIGHT = 0.0.

  return {
    fips,
    totalEstimatedDemandMale,
    totalEstimatedDemandFemale,
    totalEstimatedDemand: totalEstimatedDemandMale + totalEstimatedDemandFemale,
    demandByAgeBand,
    mhhi,
    mhhiTier: mhhiTier(mhhi),
    ppi,
    npiDensity,
  }
}
