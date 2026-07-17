'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { FUNDING_PREQUAL_GATE_STAGE, FIRST_STAGE, LAST_STAGE } from '@/lib/pipeline-stages'

/**
 * Multi-deal server actions (brief §5/§6/§7). Every write goes through the
 * SECURITY DEFINER RPCs from migration 20260716260000 — the client roles hold
 * ZERO direct write grants on deals. Authorization lives IN the functions
 * (assigned-rep-or-exec for creation, exec-only for movement/status), so these
 * actions run as the calling user's own authenticated client and simply relay
 * the database's verdict; they never widen it.
 */

export interface DealActionResult {
  ok: boolean
  error?: string
  /** Soft funding pre-qual gate: set when the caller must confirm the skip first. */
  requiresConfirm?: 'prequal'
}

/** §7 — add-another-territory: create a deal on an available territory. */
export async function addTerritoryDeal(
  prospectId: string,
  territoryId: string,
): Promise<DealActionResult & { dealId?: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('create_territory_deal', {
    p_prospect_id: prospectId,
    p_territory_id: territoryId,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/prospects/${prospectId}`)
  revalidatePath('/pipeline')
  return { ok: true, dealId: (data as string | null) ?? undefined }
}

/**
 * §6 — per-deal stage movement from the deal-history panel.
 *
 * Gate parity with the customer-level move (pipeline/actions.ts):
 *  • HARD qualification gate — enforced INSIDE move_deal_stage() at the database;
 *    the RPC's error message surfaces as-is (no friendlier app-side duplicate is
 *    needed here — the panel is an exec surface and the DB text is exact).
 *  • SOFT funding pre-qual gate — an interaction, so it lives here: crossing into
 *    Contract Sent (or beyond) without a cleared pre-qual returns requiresConfirm
 *    once; on confirm the skip is recorded on the prospect (non-stage column,
 *    untouched by the derivation guard) BEFORE the move, exactly like the
 *    customer-level action — the flag is inert if the move then fails.
 */
export async function moveDealStage(
  prospectId: string,
  dealId: string,
  targetStage: number,
  confirmed: { prequal?: boolean } = {},
): Promise<DealActionResult> {
  if (!Number.isInteger(targetStage) || targetStage < FIRST_STAGE || targetStage > LAST_STAGE) {
    return { ok: false, error: `invalid stage ${targetStage}` }
  }

  const supabase = createClient()
  const [{ data: p, error: pErr }, { data: deal, error: dErr }] = await Promise.all([
    supabase
      .from('prospects')
      .select('funding_prequal_cleared')
      .eq('id', prospectId)
      .single(),
    supabase.from('deals').select('stage, prospect_id').eq('id', dealId).single(),
  ])
  if (pErr || !p) return { ok: false, error: pErr?.message ?? 'prospect not found' }
  if (dErr || !deal) return { ok: false, error: dErr?.message ?? 'deal not found' }
  if (deal.prospect_id !== prospectId) {
    return { ok: false, error: 'deal does not belong to this prospect' }
  }

  const crossesPrequal =
    deal.stage < FUNDING_PREQUAL_GATE_STAGE &&
    targetStage >= FUNDING_PREQUAL_GATE_STAGE &&
    !p.funding_prequal_cleared
  if (crossesPrequal) {
    if (!confirmed.prequal) return { ok: false, requiresConfirm: 'prequal' }
    const { error: fErr } = await supabase
      .from('prospects')
      .update({ skipped_funding_prequal: true })
      .eq('id', prospectId)
    if (fErr) return { ok: false, error: fErr.message }
  }

  const { error } = await supabase.rpc('move_deal_stage', {
    p_deal_id: dealId,
    p_target_stage: targetStage,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/prospects/${prospectId}`)
  revalidatePath('/pipeline')
  return { ok: true }
}

/** §6 — per-deal health status from the deal-history panel (exec-only in the DB). */
export async function setDealStatus(
  prospectId: string,
  dealId: string,
  status: string,
): Promise<DealActionResult> {
  const supabase = createClient()
  const { error } = await supabase.rpc('set_deal_status', {
    p_deal_id: dealId,
    p_status: status,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/prospects/${prospectId}`)
  revalidatePath('/pipeline')
  return { ok: true }
}

export interface PickerTerritory {
  id: string
  name: string
  state: string | null
  /** §5 warning badge: an ACTIVE (non-lost) deal from a DIFFERENT prospect exists. */
  contested: boolean
}

/**
 * §5 — territories the picker offers: status = 'available' ONLY. Drafts are
 * excluded (exec-only New Territory flow, out of scope) and sold territories are
 * excluded full stop — and the database enforces both in create_territory_deal(),
 * so this filter is presentation, not the control (Hard Rule 10).
 *
 * Runs as the calling user: a rep's territories RLS already limits them to
 * available (unclaimed) rows + their own, so no service-role read is needed.
 * `contested` flags the §1 competitive-pre-close pattern — visible, non-blocking
 * (deliberate minimal-behavior-change default; no exclusivity rule exists today).
 */
export async function listPickerTerritories(
  prospectId: string,
): Promise<{ ok: boolean; error?: string; territories?: PickerTerritory[] }> {
  const supabase = createClient()
  const [{ data: territories, error: tErr }, { data: activeDeals, error: dErr }] =
    await Promise.all([
      supabase
        .from('territories')
        .select('id, name, state')
        .eq('status', 'available')
        .order('name'),
      supabase
        .from('deals')
        .select('territory_id, prospect_id, deal_status')
        .not('territory_id', 'is', null)
        .neq('deal_status', 'lost'),
    ])
  if (tErr) return { ok: false, error: tErr.message }
  if (dErr) return { ok: false, error: dErr.message }

  const contestedIds = new Set(
    (activeDeals ?? [])
      .filter((d) => d.prospect_id !== prospectId && d.territory_id != null)
      .map((d) => d.territory_id as string),
  )

  return {
    ok: true,
    territories: (territories ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      state: t.state ?? null,
      contested: contestedIds.has(t.id),
    })),
  }
}
