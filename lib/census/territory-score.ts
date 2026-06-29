/**
 * Territory signal orchestration. Pulls raw cohort + MHHI data, applies the
 * proprietary DEMAND_COEFFICIENTS, and returns a TerritorySignals object.
 *
 * This is a read-only enrichment layer feeding Tier 1 AI pre-scoring later; it
 * does NOT compute or write operator scores.
 */

import { DEMAND_COEFFICIENTS, MHHI_TIERS } from './constants'
import {
  getCohortPopulationByCounty,
  getMHHIByCounty,
  type CohortPopulation,
} from './queries'

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

// TODO: Physician density signal — pull from NPI Registry (separate scaffold, Sprint 1 Task 2)

/**
 * Orchestrate the territory signal computation for a 5-digit county FIPS.
 * Sequential by design — no parallel fan-out in this scaffold.
 */
export async function computeTerritorySignals(fips: string): Promise<TerritorySignals> {
  const cohorts = await getCohortPopulationByCounty(fips)
  const { mhhi } = await getMHHIByCounty(fips)

  const demandByAgeBand = computeDemandByAgeBand(cohorts)
  const totalEstimatedDemandMale = demandByAgeBand.reduce((s, d) => s + d.estimatedDemandMale, 0)
  const totalEstimatedDemandFemale = demandByAgeBand.reduce((s, d) => s + d.estimatedDemandFemale, 0)

  return {
    fips,
    totalEstimatedDemandMale,
    totalEstimatedDemandFemale,
    totalEstimatedDemand: totalEstimatedDemandMale + totalEstimatedDemandFemale,
    demandByAgeBand,
    mhhi,
    mhhiTier: mhhiTier(mhhi),
  }
}
