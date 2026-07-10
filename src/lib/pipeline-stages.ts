/**
 * GHMD licensee sales pipeline — single source of truth.
 *
 * Replaces the stale 7-stage franchise-era pipeline (New Lead → … → FDD Delivered →
 * Agreement Signed). "FDD Delivered" / "LOI Signed" were pre-closure artifacts from when
 * franchise/FDD regulatory exposure was still open; the 2026-07-03 counsel closure
 * (licensee ≠ FDD trigger) retired them. Every consumer imports from here — never hardcode
 * a stage number or label inline again.
 *
 * `stage` is a 1-based position (prospects.stage integer, default 1). `deal_status` is an
 * orthogonal health dimension — a deal can be stage 10 (Funded / Won) and still be stalled.
 */

export interface PipelineStage {
  /** 1-based position in the pipeline; matches prospects.stage integer. */
  id: number
  /** Human-readable label shown in UI. */
  label: string
}

/** The twelve pipeline stages, in order. Index is NOT the id — always read `.id`. */
export const PIPELINE_STAGES: PipelineStage[] = [
  { id: 1, label: 'New Lead' },
  { id: 2, label: 'Contacted' },
  { id: 3, label: 'Discovery Call Scheduled' },
  { id: 4, label: 'Discovery Call Met' },
  { id: 5, label: 'Qualification Review' }, // first-meeting qualification gate (scoping §2, decision #110)
  { id: 6, label: 'Proposal Sent' },
  { id: 7, label: 'Validation' }, // reference calls + proposal walkthrough / territory negotiation
  { id: 8, label: 'Funding Pre-Qualified' }, // lender (iLease/Ottri) confirms pre-qual to GHMD
  { id: 9, label: 'Contract Sent' },
  { id: 10, label: 'Contract Signed' },
  { id: 11, label: 'Funded / Won' },
  { id: 12, label: 'Implementation Handoff Scheduled' },
]

/**
 * Named stage ids. Use `STAGE.PROPOSAL_SENT` instead of the literal `5` so no consumer
 * hardcodes a number. Keys are frozen; values must match PIPELINE_STAGES ids exactly
 * (enforced by pipeline-stages.test.ts).
 */
export const STAGE = {
  NEW_LEAD: 1,
  CONTACTED: 2,
  DISCOVERY_CALL_SCHEDULED: 3,
  DISCOVERY_CALL_MET: 4,
  QUALIFICATION_REVIEW: 5,
  PROPOSAL_SENT: 6,
  VALIDATION: 7,
  FUNDING_PRE_QUALIFIED: 8,
  CONTRACT_SENT: 9,
  CONTRACT_SIGNED: 10,
  FUNDED_WON: 11,
  IMPLEMENTATION_HANDOFF_SCHEDULED: 12,
} as const

export const FIRST_STAGE = STAGE.NEW_LEAD
export const LAST_STAGE = STAGE.IMPLEMENTATION_HANDOFF_SCHEDULED

/**
 * Board mapping (PRD §2.5): the 12 stages render as 7 grouped columns — Qualification
 * Review gets its own column (the headline gate of this build, decision #110), inserted
 * between Discovery and Proposal. Derived from STAGE constants — never hardcode the
 * integers. Group order is pipeline order.
 */
export interface BoardColumn {
  key: string
  label: string
  stageIds: number[]
}

export const BOARD_COLUMNS: BoardColumn[] = [
  { key: 'leads', label: 'Leads', stageIds: [STAGE.NEW_LEAD, STAGE.CONTACTED] },
  { key: 'discovery', label: 'Discovery', stageIds: [STAGE.DISCOVERY_CALL_SCHEDULED, STAGE.DISCOVERY_CALL_MET] },
  { key: 'qualification', label: 'Qualification', stageIds: [STAGE.QUALIFICATION_REVIEW] },
  { key: 'proposal', label: 'Proposal', stageIds: [STAGE.PROPOSAL_SENT, STAGE.VALIDATION] },
  { key: 'funding', label: 'Funding', stageIds: [STAGE.FUNDING_PRE_QUALIFIED] },
  { key: 'contract', label: 'Contract', stageIds: [STAGE.CONTRACT_SENT, STAGE.CONTRACT_SIGNED] },
  { key: 'won', label: 'Won', stageIds: [STAGE.FUNDED_WON, STAGE.IMPLEMENTATION_HANDOFF_SCHEDULED] },
]

/** The board column a stage belongs to (or undefined if out of range). */
export function boardColumnForStage(stage: number): BoardColumn | undefined {
  return BOARD_COLUMNS.find((c) => c.stageIds.includes(stage))
}

/** Label for a stage id, with a safe fallback for out-of-range values. */
export function stageLabel(id: number): string {
  return PIPELINE_STAGES.find(s => s.id === id)?.label ?? `Stage ${id}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Deal health status (orthogonal to stage position)
// ─────────────────────────────────────────────────────────────────────────────

/** Allowed values for prospects.deal_status. Mirrors the DB CHECK constraint. */
export const DEAL_STATUSES = ['active', 'stalled', 'lost'] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]

export function isDealStatus(v: unknown): v is DealStatus {
  return typeof v === 'string' && (DEAL_STATUSES as readonly string[]).includes(v)
}

// ─────────────────────────────────────────────────────────────────────────────
// Soft funding pre-qual gate (stage 9, Contract Sent)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advancing a prospect to this stage or beyond without cleared funding pre-qual is
 * ALLOWED but prompts a confirm and flags the record. Soft by design pending real
 * pipeline data — never a hard block.
 */
export const FUNDING_PREQUAL_GATE_STAGE = STAGE.CONTRACT_SENT

/** True when advancing to `targetStage` should prompt the "advance anyway?" confirm. */
export function requiresFundingPrequalConfirm(
  targetStage: number,
  fundingPrequalCleared: boolean,
): boolean {
  return targetStage >= FUNDING_PREQUAL_GATE_STAGE && !fundingPrequalCleared
}

/** True when the amber "PRE-QUAL SKIPPED" badge should render for a record. */
export function showPrequalSkippedBadge(stage: number, skippedFundingPrequal: boolean): boolean {
  return skippedFundingPrequal && stage >= FUNDING_PREQUAL_GATE_STAGE
}

// ─────────────────────────────────────────────────────────────────────────────
// Hard qualification gate (advancing PAST Qualification Review, stage 5 -> 6+)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The first stage that is "past" Qualification Review. A prospect may not advance
 * to this stage (or beyond) unless a `qualification_reviews.recommendation = 'proceed'`
 * exists for it (decision #110, scoping §7). This is a HARD block — not a confirm —
 * enforced server-side in `moveProspectStage`.
 *
 * It sits at the SAME boundary the soft triage confirm used to occupy and SUPERSEDES
 * it: scoping §2.1 — once the hard gate is real the triage soft-skip is "redundant,
 * not additional protection." The triage badge helpers below are kept dormant
 * (skipped_triage deprecated-in-place, PR2/#110) for the existing read-paths; the
 * soft triage *confirm* is gone from the move action.
 */
export const QUALIFICATION_GATE_STAGE = STAGE.PROPOSAL_SENT

/**
 * True when a stage move CROSSES the Qualification Review boundary from below — i.e.
 * the move would carry a prospect from at-or-before Qualification Review to past it.
 * Only these moves require a cleared `proceed` review. A prospect already past the
 * boundary (e.g. a legacy fixture seeded at Proposal Sent before the review table
 * existed) does NOT re-trigger the gate on a further forward move — the plain reading
 * of "cannot advance PAST Qualification Review," and it avoids trapping already-past
 * records with no review row (brief §3). Mirrors the crossing semantics of the
 * funding gate exactly.
 */
export function crossesQualificationGate(currentStage: number, targetStage: number): boolean {
  return currentStage < QUALIFICATION_GATE_STAGE && targetStage >= QUALIFICATION_GATE_STAGE
}

// ─────────────────────────────────────────────────────────────────────────────
// Triage badge (DORMANT — skipped_triage deprecated-in-place, PR2/#110). The soft
// triage *confirm* was replaced by the hard qualification gate above; these
// read-path helpers remain only so existing badge consumers keep compiling until a
// future cleanup drops the column. `requiresTriageConfirm` is retained for the same
// reason and is no longer called by the move action.
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Boundary of the retired soft triage confirm (== QUALIFICATION_GATE_STAGE). */
export const TRIAGE_GATE_STAGE = STAGE.PROPOSAL_SENT

/** @deprecated The hard qualification gate replaced the triage confirm; unused by the move action. */
export function requiresTriageConfirm(targetStage: number, triageComplete: boolean): boolean {
  return targetStage >= TRIAGE_GATE_STAGE && !triageComplete
}

/** @deprecated Dormant — skipped_triage is never set (PR2/#110). Kept for existing badge reads. */
export function showTriageSkippedBadge(stage: number, skippedTriage: boolean): boolean {
  return skippedTriage && stage >= TRIAGE_GATE_STAGE
}
