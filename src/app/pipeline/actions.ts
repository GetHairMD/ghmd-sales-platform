'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  FUNDING_PREQUAL_GATE_STAGE,
  TRIAGE_GATE_STAGE,
  FIRST_STAGE,
  LAST_STAGE,
} from '@/lib/pipeline-stages'

export interface MoveResult {
  ok: boolean
  error?: string
  /** Set when a soft gate is crossed and the caller hasn't confirmed the skip yet. */
  requiresConfirm?: 'triage' | 'prequal'
}

/**
 * Move a prospect to `targetStage`, recording soft-gate skips SERVER-SIDE
 * (PRD hard constraint). A gate only fires when the move CROSSES the gate
 * boundary from below; already-past moves don't re-prompt. Never a hard block —
 * once confirmed, the skip flag is set and the move proceeds.
 */
export async function moveProspectStage(
  prospectId: string,
  targetStage: number,
  confirmed: { triage?: boolean; prequal?: boolean } = {},
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

  const update: Record<string, unknown> = {
    stage: targetStage,
    stage_updated_at: new Date().toISOString(),
  }

  // Triage gate (crossing into Proposal Sent). Demo has no Tier 2 data → triage never complete.
  const crossesTriage = p.stage < TRIAGE_GATE_STAGE && targetStage >= TRIAGE_GATE_STAGE
  if (crossesTriage) {
    if (!confirmed.triage) return { ok: false, requiresConfirm: 'triage' }
    update.skipped_triage = true
  }

  // Funding pre-qual gate (crossing into Contract Sent) without cleared pre-qual.
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
