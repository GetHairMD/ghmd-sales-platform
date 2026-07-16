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
import { TERRITORY_STANDARD_PRICE } from '@/components/proposal/constants'

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
 * Two enforcement layers, both SERVER-SIDE (PRD hard constraint; the client never
 * decides gate state):
 *
 *  1. HARD qualification gate — a prospect may not advance PAST Qualification Review
 *     (into Proposal Sent or beyond) unless a `qualification_reviews.recommendation =
 *     'proceed'` exists for it. Not overridable (returns `blocked: 'qualification'`).
 *     This replaces the soft triage confirm that previously sat at this same boundary
 *     (scoping §2.1 — the hard gate makes it "redundant, not additional protection").
 *     Enforced here regardless of the target stage the client submits — a direct call
 *     with a manipulated `targetStage` hits the same check.
 *
 *  2. SOFT funding pre-qual gate — crossing into Contract Sent without a cleared
 *     lender pre-qual is ALLOWED but prompts a confirm and flags the record. Once
 *     confirmed, `skipped_funding_prequal` is recorded and the move proceeds.
 *
 * A gate only evaluates when the move CROSSES its boundary from below; already-past
 * moves don't re-trigger it.
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
  const { data: p, error } = await supabase
    .from('prospects')
    .select('stage, funding_prequal_cleared')
    .eq('id', prospectId)
    .single()
  if (error || !p) return { ok: false, error: error?.message ?? 'prospect not found' }

  // ── Hard qualification gate ────────────────────────────────────────────────
  // Crossing past Qualification Review requires a cleared 'proceed' review. This is
  // a hard block, evaluated on the move itself — not a UI-only guard (Hard Rule 10:
  // a missing button is not a security control).
  if (crossesQualificationGate(p.stage, targetStage)) {
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

  const update: Record<string, unknown> = {
    stage: targetStage,
    stage_updated_at: new Date().toISOString(),
  }

  // ── Soft funding pre-qual gate (crossing into Contract Sent) ────────────────
  const crossesPrequal =
    p.stage < FUNDING_PREQUAL_GATE_STAGE &&
    targetStage >= FUNDING_PREQUAL_GATE_STAGE &&
    !p.funding_prequal_cleared
  if (crossesPrequal) {
    if (!confirmed.prequal) return { ok: false, requiresConfirm: 'prequal' }
    update.skipped_funding_prequal = true
  }

  // ── No Funded/Won without a recorded price (Trace's invariant) ──────────────
  // stamp_prospect_funded_won() REJECTS the stage→Funded/Won crossing unless a priced
  // deals row exists (migration 20260716140000). Record the standard price DELIBERATELY,
  // here in the app layer, when a prospect first crosses into Funded/Won with no deal —
  // never as a silent trigger insert (a price should be recorded by an actor, not just
  // materialize). An executive who negotiated a discount created the deal at the
  // negotiated price earlier via the discount-entry action, so we auto-fill ONLY when no
  // deal exists and never overwrite it. This runs before the stage update below, so the
  // trigger's guard is satisfied by the time it fires.
  //
  // Not wrapped in a DB transaction with the stage update (two PostgREST calls): if the
  // stage update below fails after this insert, an unused list-price deal is left behind —
  // harmless (it is the correct standard price) and reused on the next close attempt.
  if (p.stage < STAGE.FUNDED_WON && targetStage >= STAGE.FUNDED_WON) {
    const { data: existingDeals, error: dealReadErr } = await supabase
      .from('deals')
      .select('id')
      .eq('prospect_id', prospectId)
      .limit(1)
    if (dealReadErr) return { ok: false, error: dealReadErr.message }
    if (!existingDeals || existingDeals.length === 0) {
      const { error: dealInsErr } = await supabase
        .from('deals')
        .insert({ prospect_id: prospectId, territory_price: TERRITORY_STANDARD_PRICE })
      if (dealInsErr) return { ok: false, error: dealInsErr.message }
    }
  }

  const { error: uErr } = await supabase.from('prospects').update(update).eq('id', prospectId)
  if (uErr) return { ok: false, error: uErr.message }

  revalidatePath('/pipeline')
  return { ok: true }
}
