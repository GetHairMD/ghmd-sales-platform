'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
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
  // ── Auth: caller must hold a designation authorized to set/authorize pricing ──
  // Gate on MEMBERSHIP in discount_authorizing_designations — the registry that governs
  // who may authorize discounts (Hard Rule 6, Trace-extensible) — NOT a hardcoded
  // 'executive' string. Behaviour is identical today (the registry holds exactly
  // 'executive'), but this stays correct the moment Trace adds a designation, and it is
  // the honest check: the registry, not the literal 'executive', is the source of truth.
  //
  // Read via the SERVICE client (the registry has no client grants). This runs on EVERY
  // invocation, so — now that territory_price UPDATE is client-revoked and this is the
  // only price-write path — every price change is re-validated against CURRENT
  // authorization state, closing the trigger's "unrelated-update" re-validation gap.
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const service = createServiceClient()
  const { data: iu, error: iuErr } = await service
    .from('internal_users')
    .select('designation')
    .eq('user_id', user.id)
    .maybeSingle()
  if (iuErr) return { ok: false, error: iuErr.message }
  if (!iu?.designation) {
    return { ok: false, error: 'Not authorized to set a territory price.' }
  }
  const { data: authorizing, error: regErr } = await service
    .from('discount_authorizing_designations')
    .select('designation')
    .eq('designation', iu.designation)
    .maybeSingle()
  if (regErr) return { ok: false, error: regErr.message }
  if (!authorizing) {
    return { ok: false, error: 'Your role is not authorized to set territory prices.' }
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

  // ── Atomic write via the set_deal_price() RPC (migration 20260716200000) ─────
  // The write goes through set_deal_price() rather than an inline select+insert/update so
  // it takes a FOR UPDATE lock on the SAME prospects row as ensure_priced_deal() — the two
  // functions therefore serialize against each other, closing the cross-function race where
  // saving a negotiated price and closing the same deal could both insert a first deal
  // (Round 7; Round 6's own-call-only reasoning missed this). SECURITY DEFINER lets it write
  // the client-locked columns (territory_price / discount pair); it is EXECUTE-granted to
  // service_role only, so only this already-authorization-gated action can reach it.
  //
  // The 0→insert / 1→update / ≥2→'multiple' branch is unchanged — it moved into the function
  // behind the lock. discount_authorized_by is still self-stamped from the calling user
  // (never client input); the validate_deal_discount_authorization() trigger still validates
  // it on the write.
  const { data: status, error: rpcErr } = await service.rpc('set_deal_price', {
    p_prospect_id: prospectId,
    p_territory_price: price,
    p_discount_reason: discountReason,
    p_discount_authorized_by: belowList ? user.id : null,
  })
  if (rpcErr) return { ok: false, error: rpcErr.message }
  if (status === 'multiple') {
    // ≥2 deals: no unambiguous "the" deal to correct — refuse rather than overwrite one and
    // lose another territory's price/discount history. Per-deal targeting is the follow-up.
    return {
      ok: false,
      error:
        'This customer has multiple deals. Editing a specific deal (and adding a new territory) is coming in the deal-history view — this action will not overwrite an unspecified one.',
    }
  }

  revalidatePath(`/prospects/${prospectId}`)
  return { ok: true }
}
