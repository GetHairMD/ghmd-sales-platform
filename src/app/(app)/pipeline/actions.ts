'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  FUNDING_PREQUAL_GATE_STAGE,
  STAGE,
  crossesQualificationGate,
  FIRST_STAGE,
  LAST_STAGE,
} from '@/lib/pipeline-stages'
import { resolveLeadingDeal, type LeadingDealRow } from '@/lib/leading-deal'

export interface MoveResult {
  ok: boolean
  error?: string
  /** Set when a SOFT gate is crossed and the caller hasn't confirmed the skip yet. */
  requiresConfirm?: 'prequal'
  /**
   * Set when a HARD gate blocks the move outright. Unlike `requiresConfirm`, this is
   * NOT overridable — there is no confirm that lets the move proceed (scoping §7,
   * decision #110). Today the only hard gate is qualification.
   */
  blocked?: 'qualification'
}

/**
 * Move a prospect to `targetStage`.
 *
 * MULTI-DEAL MODEL (partial revision of decision #53 item A): deals.stage is the
 * authoritative per-territory pipeline position and prospects.stage is a DERIVED
 * roll-up (MAX over non-lost deals, trigger-maintained). So this action no longer
 * writes prospects.stage directly when the prospect has deals — it moves the
 * LEADING deal through the exec-gated move_deal_stage() RPC and lets the
 * derivation trigger update the roll-up (which in turn fires the existing
 * funded-won stamping/bell machinery unchanged). A deal-less prospect keeps the
 * direct prospects.stage write — there is nothing to derive from, and the DB
 * derivation guard admits exactly that case.
 *
 * Gate layers, all still SERVER-SIDE (the client never decides gate state):
 *
 *  1. HARD qualification gate — advancing PAST Qualification Review requires a
 *     `qualification_reviews.recommendation = 'proceed'`. Checked here for the
 *     friendly `blocked` result, AND enforced inside move_deal_stage() at the
 *     database (new with this build — previously app-layer only), so a raw RPC
 *     call cannot bypass it for deal-backed moves.
 *
 *  2. SOFT funding pre-qual gate — crossing into Contract Sent without a cleared
 *     lender pre-qual prompts a confirm and flags the record. Interaction, not a
 *     data rule — stays app-side by design.
 *
 * Crossings are evaluated against the stage of the record that MOVES (the leading
 * deal when one exists, the prospect otherwise) — a repeat customer's second deal
 * runs its own gate crossings even while the customer-level stage sits at
 * Funded/Won (brief §2).
 *
 * Close crossing (→ Funded/Won) for a deal-less prospect: ensure_priced_deal()
 * records the standard price first (inheriting the prospect's current stage so
 * the derivation never drags the customer backward), then the move goes through
 * move_deal_stage() like any other deal-backed move.
 */
export async function moveProspectStage(
  prospectId: string,
  targetStage: number,
  confirmed: { prequal?: boolean } = {},
): Promise<MoveResult> {
  if (!Number.isInteger(targetStage) || targetStage < FIRST_STAGE || targetStage > LAST_STAGE) {
    return { ok: false, error: `invalid stage ${targetStage}` }
  }

  const supabase = createClient()
  const [{ data: p, error }, { data: dealRows, error: dErr }] = await Promise.all([
    supabase
      .from('prospects')
      .select('stage, funding_prequal_cleared')
      .eq('id', prospectId)
      .single(),
    supabase
      .from('deals')
      .select('id, stage, deal_status, created_at')
      .eq('prospect_id', prospectId),
  ])
  if (error || !p) return { ok: false, error: error?.message ?? 'prospect not found' }
  if (dErr) return { ok: false, error: dErr.message }

  const leadingDeal = resolveLeadingDeal((dealRows ?? []) as LeadingDealRow[])
  // The stage of the record that actually moves — gates evaluate PER RECORD.
  const currentStage = leadingDeal?.stage ?? p.stage

  // ── Hard qualification gate ────────────────────────────────────────────────
  // Friendly app-side check (structured `blocked` result for the board UI). The
  // database enforces the same rule inside move_deal_stage() for deal-backed
  // moves — this check is UX, that one is the control (Hard Rule 10).
  if (crossesQualificationGate(currentStage, targetStage)) {
    const { data: review, error: rErr } = await supabase
      .from('qualification_reviews')
      .select('recommendation')
      .eq('prospect_id', prospectId)
      .maybeSingle()
    if (rErr) return { ok: false, error: rErr.message }
    if (review?.recommendation !== 'proceed') {
      return {
        ok: false,
        blocked: 'qualification',
        error:
          'Qualification Review must be cleared with a “Proceed” recommendation before this prospect can advance past it.',
      }
    }
  }

  // ── Soft funding pre-qual gate (crossing into Contract Sent) ────────────────
  const crossesPrequal =
    currentStage < FUNDING_PREQUAL_GATE_STAGE &&
    targetStage >= FUNDING_PREQUAL_GATE_STAGE &&
    !p.funding_prequal_cleared
  if (crossesPrequal) {
    if (!confirmed.prequal) return { ok: false, requiresConfirm: 'prequal' }
    // Record the skip BEFORE the move: if the move then fails, the flag is inert
    // (the badge only renders at/past the gate stage); the reverse order could
    // advance the record while losing the skip evidence. Non-stage column —
    // untouched by the derivation guard.
    const { error: fErr } = await supabase
      .from('prospects')
      .update({ skipped_funding_prequal: true })
      .eq('id', prospectId)
    if (fErr) return { ok: false, error: fErr.message }
  }

  // ── Resolve which record moves ───────────────────────────────────────────────
  let dealIdToMove = leadingDeal?.id ?? null

  if (!dealIdToMove && targetStage >= STAGE.FUNDED_WON && p.stage < STAGE.FUNDED_WON) {
    // No Funded/Won without a recorded price (Trace's invariant): record the
    // standard price deliberately via the atomic RPC (prospect-row lock — no
    // double-insert race), then move THAT deal. The insert inherits the
    // prospect's current stage, so the derivation is a no-op until the move.
    const { data: ensuredId, error: ensureErr } = await supabase.rpc('ensure_priced_deal', {
      p_prospect_id: prospectId,
    })
    if (ensureErr) return { ok: false, error: ensureErr.message }
    dealIdToMove = (ensuredId as string | null) ?? null
    if (!dealIdToMove) return { ok: false, error: 'could not record a priced deal for the close' }
  }

  if (dealIdToMove) {
    // Deal-backed move: the exec-gated RPC updates deals.stage; the derivation
    // trigger rolls prospects.stage up (stamping funded_won_at / territory sold /
    // bell exactly as before, in one transaction).
    const { error: mErr } = await supabase.rpc('move_deal_stage', {
      p_deal_id: dealIdToMove,
      p_target_stage: targetStage,
    })
    if (mErr) return { ok: false, error: mErr.message }
  } else {
    // Deal-less prospect below the close boundary: direct prospects.stage write,
    // exactly as before this build. The DB derivation guard admits this case
    // (no non-lost deals exist).
    const { error: uErr } = await supabase
      .from('prospects')
      .update({ stage: targetStage, stage_updated_at: new Date().toISOString() })
      .eq('id', prospectId)
    if (uErr) return { ok: false, error: uErr.message }
  }

  revalidatePath('/pipeline')
  return { ok: true }
}
