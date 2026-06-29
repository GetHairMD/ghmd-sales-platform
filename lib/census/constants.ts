// Demand model: Demand% = population × hairIssueRate × propensityToAct
// Source: GHMD internal model. Do not modify without Chat approval.
// Future: promote to Supabase config table when per-market tuning is required.
//
// Structure note: DEMAND_COEFFICIENTS is shaped as an array of flat rows so it
// mirrors a future Supabase config table (one row per age band). Promoting it
// later means swapping the import source — the Census/scoring layers consume the
// same DemandCoefficient[] shape regardless of origin.

export type DemandCoefficient = {
  ageBand: string
  hairIssueRateMale: number
  hairIssueRateFemale: number
  propensityToActMale: number
  propensityToActFemale: number
}

export const DEMAND_COEFFICIENTS: DemandCoefficient[] = [
  // { ageBand, hairIssueRateMale, hairIssueRateFemale, propensityToActMale, propensityToActFemale }
  { ageBand: '20-24', hairIssueRateMale: 0.05, hairIssueRateFemale: 0.005, propensityToActMale: 0.5, propensityToActFemale: 0.9 },
  { ageBand: '25-29', hairIssueRateMale: 0.2, hairIssueRateFemale: 0.02, propensityToActMale: 0.65, propensityToActFemale: 0.9 },
  { ageBand: '30-34', hairIssueRateMale: 0.2, hairIssueRateFemale: 0.02, propensityToActMale: 0.65, propensityToActFemale: 0.9 },
  { ageBand: '35-39', hairIssueRateMale: 0.3, hairIssueRateFemale: 0.15, propensityToActMale: 0.65, propensityToActFemale: 0.9 },
  { ageBand: '40-44', hairIssueRateMale: 0.3, hairIssueRateFemale: 0.2, propensityToActMale: 0.65, propensityToActFemale: 0.9 },
  { ageBand: '45-49', hairIssueRateMale: 0.45, hairIssueRateFemale: 0.22, propensityToActMale: 0.65, propensityToActFemale: 0.9 },
  { ageBand: '50-54', hairIssueRateMale: 0.45, hairIssueRateFemale: 0.25, propensityToActMale: 0.5, propensityToActFemale: 0.9 },
  { ageBand: '55-59', hairIssueRateMale: 0.5, hairIssueRateFemale: 0.3, propensityToActMale: 0.5, propensityToActFemale: 0.9 },
  { ageBand: '60-64', hairIssueRateMale: 0.5, hairIssueRateFemale: 0.4, propensityToActMale: 0.5, propensityToActFemale: 0.9 },
  { ageBand: '65-69', hairIssueRateMale: 0.55, hairIssueRateFemale: 0.45, propensityToActMale: 0.25, propensityToActFemale: 0.9 },
  { ageBand: '70-74', hairIssueRateMale: 0.6, hairIssueRateFemale: 0.5, propensityToActMale: 0.25, propensityToActFemale: 0.75 },
  { ageBand: '75-79', hairIssueRateMale: 0.7, hairIssueRateFemale: 0.55, propensityToActMale: 0.25, propensityToActFemale: 0.75 },
]

// Cohorts 80-84 and 85+ are intentionally excluded — propensity to act
// drops to 0.5%/1.0%, contributing negligible demand signal.

// MHHI bucketing thresholds (median household income, USD):
//   low:  mhhi <  low  (< $60k)
//   mid:  low <= mhhi <= high  ($60k–$100k, inclusive of both bounds)
//   high: mhhi >  high (> $100k)
export const MHHI_TIERS = {
  low: 60_000,
  high: 100_000,
} as const
