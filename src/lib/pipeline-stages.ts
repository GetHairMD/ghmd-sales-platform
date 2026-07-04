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

/** The eleven pipeline stages, in order. Index is NOT the id — always read `.id`. */
export const PIPELINE_STAGES: PipelineStage[] = [
  { id: 1, label: 'New Lead' },
  { id: 2, label: 'Contacted' },
  { id: 3, label: 'Discovery Call Scheduled' },
  { id: 4, label: 'Discovery Call Met' },
  { id: 5, label: 'Proposal Sent' },
  { id: 6, label: 'Validation' }, // reference calls + proposal walkthrough / territory negotiation
  { id: 7, label: 'Funding Pre-Qualified' }, // lender (iLease/Ottri) confirms pre-qual to GHMD
  { id: 8, label: 'Contract Sent' },
  { id: 9, label: 'Contract Signed' },
  { id: 10, label: 'Funded / Won' },
  { id: 11, label: 'Implementation Handoff Scheduled' },
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
  PROPOSAL_SENT: 5,
  VALIDATION: 6,
  FUNDING_PRE_QUALIFIED: 7,
  CONTRACT_SENT: 8,
  CONTRACT_SIGNED: 9,
  FUNDED_WON: 10,
  IMPLEMENTATION_HANDOFF_SCHEDULED: 11,
} as const

export const FIRST_STAGE = STAGE.NEW_LEAD
export const LAST_STAGE = STAGE.IMPLEMENTATION_HANDOFF_SCHEDULED

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
// Soft funding pre-qual gate (stage 8, Contract Sent)
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
// Soft triage gate (4 -> 5, Proposal Sent) — same shape as the funding gate.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advancing a prospect to Proposal Sent (or beyond) without a completed triage is
 * ALLOWED but prompts a confirm and flags the record (skipped_triage). Soft by
 * design — never a hard block. Protects the uniformly-applied-criteria record by
 * turning every deviation into a logged, deliberate act (PRD §2.3).
 */
export const TRIAGE_GATE_STAGE = STAGE.PROPOSAL_SENT

/** True when advancing to `targetStage` without a complete triage should prompt "advance anyway?". */
export function requiresTriageConfirm(targetStage: number, triageComplete: boolean): boolean {
  return targetStage >= TRIAGE_GATE_STAGE && !triageComplete
}

/** True when the amber "TRIAGE SKIPPED" badge should render for a record. */
export function showTriageSkippedBadge(stage: number, skippedTriage: boolean): boolean {
  return skippedTriage && stage >= TRIAGE_GATE_STAGE
}
