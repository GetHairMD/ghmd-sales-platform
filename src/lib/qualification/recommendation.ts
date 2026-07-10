/**
 * Qualification review recommendation — the gate signal.
 *
 * Single source of truth for the three allowed values, mirroring the
 * `qualification_reviews.recommendation` CHECK constraint (migration
 * 20260709120000). `proceed` is the value the hard stage-advancement gate keys off
 * (decision #110, scoping §7). Import this everywhere instead of hardcoding the
 * strings so the UI dropdown, the server action's validation, and the DB constraint
 * can never drift apart.
 */

export const QUALIFICATION_RECOMMENDATIONS = ['proceed', 'conditional', 'not_qualified'] as const

export type QualificationRecommendation = (typeof QUALIFICATION_RECOMMENDATIONS)[number]

export function isQualificationRecommendation(v: unknown): v is QualificationRecommendation {
  return typeof v === 'string' && (QUALIFICATION_RECOMMENDATIONS as readonly string[]).includes(v)
}

/** The value that clears the hard gate (scoping §7). */
export const GATE_CLEARING_RECOMMENDATION: QualificationRecommendation = 'proceed'

/** Human-readable labels for the recommendation values (UI). */
export const RECOMMENDATION_LABELS: Record<QualificationRecommendation, string> = {
  proceed: 'Proceed',
  conditional: 'Conditional — needs follow-up',
  not_qualified: 'Not qualified',
}
