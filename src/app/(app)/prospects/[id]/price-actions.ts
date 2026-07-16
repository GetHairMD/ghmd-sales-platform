'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { viewerIsExecutive } from '@/lib/auth/internal-role'
import { TERRITORY_STANDARD_PRICE } from '@/components/proposal/constants'
import { isDiscountReason, type DiscountReason } from '@/lib/rep-command-center/metrics'

export interface SetPriceResult {
  ok: boolean
  error?: string
}

/**
 * Executive-only: record the territory price (and, below list, the authorized discount)
 * for a prospect BEFORE it closes — the entry path that makes the discount-authorization
 * mechanism (migration 20260716120000) actually mean something. Without this, an
 * authorized discount could never be applied and every close would fall back to the
 * $179,000 standard-price auto-fill in moveProspectStage().
 *
 * Authorization boundary (mirrors the rest of §4D — gate in CODE, columns stay locked):
 *  • Executive-gated via getViewerDesignation() === 'executive' — NOT a widened RLS grant.
 *    A rep or unauthenticated caller is rejected here before any write.
 *  • Written through the SERVICE-ROLE client because discount_reason / discount_authorized_by
 *    are revoked from every client column-grant (migration 20260716120000 §6). The exec's
 *    own browser client cannot touch them; only this server action can.
 *  • discount_authorized_by is SELF-STAMPED from the calling executive's session
 *    (`user.id`), never accepted as client input — same non-forgeable pattern as
 *    resource_shares.rep_id. (An exec authorizing on another exec's behalf is deliberately
 *    NOT supported; if that's ever wanted it should be an explicit, separate capability,
 *    flagged rather than silently allowed.)
 *  • The existing validate_deal_discount_authorization() trigger still runs on the write
 *    (service_role bypasses grants/RLS but NOT triggers/CHECKs) — it is the record of
 *    authorization; this action does not duplicate or bypass it.
 *
 * A below-list price REQUIRES a discount_reason at the application layer (before the write
 * even reaches the DB) — the trigger/CHECK remain the backstop of record, but an obviously
 * incomplete submission is rejected up front.
 */
export async function setTerritoryPrice(
  prospectId: string,
  priceInput: number,
  discountReasonInput?: string | null,
): Promise<SetPriceResult> {
  // ── Auth: executive only ────────────────────────────────────────────────────
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  if (!(await viewerIsExecutive())) {
    return { ok: false, error: 'Executive access required to set a territory price.' }
  }

  // ── Validate the price ──────────────────────────────────────────────────────
  const price = Number(priceInput)
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: 'Enter a territory price greater than zero.' }
  }

  const belowList = price < TERRITORY_STANDARD_PRICE
  let discountReason: DiscountReason | null = null
  if (belowList) {
    // App-layer guard: a below-list price is a discount and must carry a reason.
    if (!discountReasonInput || !isDiscountReason(discountReasonInput)) {
      return {
        ok: false,
        error: `A discount reason is required for any price below ${TERRITORY_STANDARD_PRICE.toLocaleString('en-US')}.`,
      }
    }
    discountReason = discountReasonInput
  }
  // At or above list: no discount, so both discount columns are cleared.

  // ── Write via service-role (discount columns are client-locked) ─────────────
  const service = createServiceClient()
  const patch = {
    territory_price: price,
    discount_reason: discountReason,
    // Self-stamped: the authorizer is the calling executive, never client-supplied.
    discount_authorized_by: belowList ? user.id : null,
  }

  const { data: existing, error: readErr } = await service
    .from('deals')
    .select('id')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (readErr) return { ok: false, error: readErr.message }

  if (existing) {
    const { error: updErr } = await service.from('deals').update(patch).eq('id', existing.id)
    if (updErr) return { ok: false, error: updErr.message }
  } else {
    const { error: insErr } = await service
      .from('deals')
      .insert({ prospect_id: prospectId, ...patch })
    if (insErr) return { ok: false, error: insErr.message }
  }

  revalidatePath(`/prospects/${prospectId}`)
  return { ok: true }
}
