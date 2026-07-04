/**
 * Priority Action List logic (PRD §3.1) — the board's real home page.
 *
 * Pure and server-computed: every row's reason is DERIVED from prospect data
 * (stage, days-in-stage, health, skip flags), never free text. One row per
 * prospect (its strongest signal), ranked, capped at 8. Lost deals are excluded.
 */

import { STAGE, stageLabel, type DealStatus } from './pipeline-stages'

export interface PriorityProspect {
  id: string
  full_name: string
  practice_name: string | null
  stage: number
  deal_status: DealStatus
  skipped_triage: boolean
  skipped_funding_prequal: boolean
  funding_prequal_cleared: boolean
  stage_updated_at: string
}

export interface PriorityAction {
  prospectId: string
  who: string
  reason: string
  action: string
  /** Higher sorts first. */
  weight: number
}

const MS_PER_DAY = 86_400_000

export function daysInStage(stageUpdatedAt: string, nowMs: number): number {
  const then = new Date(stageUpdatedAt).getTime()
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((nowMs - then) / MS_PER_DAY))
}

/** The single strongest signal for one prospect, or null if nothing is notable. */
function signalFor(p: PriorityProspect, nowMs: number): Omit<PriorityAction, 'prospectId' | 'who'> | null {
  const days = daysInStage(p.stage_updated_at, nowMs)
  const at = stageLabel(p.stage)

  if (p.deal_status === 'stalled') {
    return { reason: `Stalled ${days}d at ${at}`, action: 'Re-engage', weight: 100 + days }
  }
  if (p.skipped_funding_prequal && p.stage >= STAGE.CONTRACT_SENT) {
    return { reason: `Contract out without cleared pre-qual`, action: 'Confirm financing', weight: 90 }
  }
  if (p.skipped_triage && p.stage >= STAGE.PROPOSAL_SENT) {
    return { reason: `Proposal sent with triage incomplete`, action: 'Complete Tier 2 review', weight: 85 }
  }
  if (p.stage === STAGE.DISCOVERY_CALL_MET) {
    return { reason: `Discovery met ${days}d ago — triage pending`, action: 'Start Tier 2 review', weight: 70 + days }
  }
  if (p.stage === STAGE.FUNDING_PRE_QUALIFIED && p.funding_prequal_cleared) {
    return { reason: `Pre-qual cleared`, action: 'Send contract', weight: 65 }
  }
  if (p.stage === STAGE.CONTRACT_SIGNED) {
    return { reason: `Signed ${days}d ago — awaiting countersign/funding`, action: 'Advance to Won', weight: 60 }
  }
  if (p.stage === STAGE.DISCOVERY_CALL_SCHEDULED) {
    return { reason: `Discovery call scheduled`, action: 'Prep call', weight: 40 }
  }
  // Anything sitting a while gets a gentle nudge.
  if (days >= 5 && p.stage < STAGE.FUNDED_WON) {
    return { reason: `${days}d at ${at}`, action: 'Follow up', weight: 20 + days }
  }
  return null
}

export function computePriorityActions(
  prospects: PriorityProspect[],
  nowMs: number,
  limit = 8,
): PriorityAction[] {
  return prospects
    .filter((p) => p.deal_status !== 'lost')
    .map((p) => {
      const sig = signalFor(p, nowMs)
      if (!sig) return null
      return {
        prospectId: p.id,
        who: p.practice_name ? `${p.full_name} · ${p.practice_name}` : p.full_name,
        ...sig,
      }
    })
    .filter((x): x is PriorityAction => x !== null)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
}
