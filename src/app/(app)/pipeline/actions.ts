'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  FUNDING_PREQUAL_GATE_STAGE,
  crossesQualificationGate,
  FIRST_STAGE,
  LAST_STAGE,
} from '@/lib/pipeline-stages'

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

  const { error: uErr } = await supabase.from('prospects').update(update).eq('id', prospectId)
  if (uErr) return { ok: false, error: uErr.message }

  revalidatePath('/pipeline')
  return { ok: true }
}
