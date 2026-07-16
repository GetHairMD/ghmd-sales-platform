-- ─────────────────────────────────────────────────────────────────────────────
-- §4D Round 7 — unify the deal-write lock so setTerritoryPrice and
-- ensure_priced_deal serialize against EACH OTHER (cross-function race).
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP never touched.
--
-- THE GAP (a correction to Round 6's reasoning — stated plainly, not smoothed over):
-- Round 6 gave ensure_priced_deal() a FOR UPDATE lock on the prospects row, and
-- dismissed setTerritoryPrice's own read-then-write race as "lower risk, self-limiting"
-- because its ≥2→REFUSE branch stops two setTerritoryPrice calls racing EACH OTHER.
-- That reasoning did NOT cover setTerritoryPrice racing ensure_priced_deal — two
-- different functions. A Postgres row lock only blocks a caller who ALSO locks that
-- same row; setTerritoryPrice locked nothing, so ensure_priced_deal's lock never
-- applied to it. An executive saving a negotiated price (setTerritoryPrice) and closing
-- the same deal (ensure_priced_deal via moveProspectStage) in close succession could
-- have BOTH read "no deal" and BOTH insert — one discounted row + one $179k row — the
-- same double-count-revenue outcome Round 6 was meant to close everywhere.
--
-- THE FIX: give setTerritoryPrice's deal-write the SAME lock target as
-- ensure_priced_deal — the prospects row for the same p_prospect_id — by relocating its
-- 0/1/≥2 branch into this function behind that lock. Two functions locking the same row
-- genuinely serialize regardless of call order (row locks are physical, role-independent:
-- ensure_priced_deal's INVOKER lock and this DEFINER lock on the same row block each other).
--
-- SECURITY DEFINER + search_path='' + EXECUTE revoked from every CLIENT role — the exact
-- pattern of validate_deal_discount_authorization(). This function writes the
-- client-locked columns (territory_price — Round 5; discount_reason/discount_authorized_by
-- — Round 1), so it MUST stay unreachable by anon/authenticated: granting it to a client
-- role would reopen the discount-column write path those rounds closed. It is invoked
-- ONLY by the setTerritoryPrice server action's existing service-role client, so EXECUTE
-- is granted to service_role alone. The action's app-layer authorization check (registry
-- membership) stays exactly where it is and is unchanged — nothing but that already-gated
-- action can reach this function, so it does not re-check authorization itself.
--
-- The validate_deal_discount_authorization() trigger still fires on this function's
-- INSERT/UPDATE (triggers are not bypassed by SECURITY DEFINER) — unchanged belt-and-
-- suspenders: a discount_authorized_by not in discount_authorizing_designations is still
-- rejected through this path.
--
-- Branch logic and thresholds are byte-identical to today's inline code (0→insert,
-- 1→update that row, ≥2→'multiple' with no write); only the location changed (now behind
-- the lock). ensure_priced_deal is unchanged — it already locks correctly.
--
-- New migration; 20260716120000 / 140000 / 160000 / 180000 are applied and NOT edited.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_deal_price(
  p_prospect_id           uuid,
  p_territory_price        numeric,
  p_discount_reason        text,
  p_discount_authorized_by uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  -- Same lock target as ensure_priced_deal (prospects row, same id) — this is the whole
  -- point: the two functions now block each other under standard row-lock semantics.
  perform 1 from public.prospects where id = p_prospect_id for update;

  -- Same read as the old inline code (all deals for the prospect, oldest-first).
  select array_agg(id order by created_at asc) into v_ids
  from public.deals
  where prospect_id = p_prospect_id;

  if v_ids is null then
    -- 0 deals → insert the first at the given price/reason/authorizer.
    insert into public.deals (prospect_id, territory_price, discount_reason, discount_authorized_by)
    values (p_prospect_id, p_territory_price, p_discount_reason, p_discount_authorized_by);
    return 'inserted';
  elsif array_length(v_ids, 1) = 1 then
    -- exactly 1 deal → correct that row.
    update public.deals
      set territory_price        = p_territory_price,
          discount_reason        = p_discount_reason,
          discount_authorized_by = p_discount_authorized_by
      where id = v_ids[1];
    return 'updated';
  else
    -- ≥2 deals → refuse without writing; the caller surfaces the existing message.
    return 'multiple';
  end if;
end;
$$;

comment on function public.set_deal_price(uuid, numeric, text, uuid) is
  'Atomic deal price/discount write for setTerritoryPrice (§4D Round 7). Locks the prospect '
  'row FOR UPDATE — the SAME target as ensure_priced_deal — so the two functions serialize '
  'against each other and cannot both insert a first deal in a race. Relocates the existing '
  '0→insert / 1→update / ≥2→''multiple'' branch behind that lock; logic and thresholds '
  'unchanged. SECURITY DEFINER so it can write the client-locked columns (territory_price, '
  'discount_reason, discount_authorized_by); EXECUTE revoked from every client role and '
  'granted to service_role only, so the sole caller is the already-authorization-gated '
  'setTerritoryPrice server action. The validate_deal_discount_authorization() trigger still '
  'fires on its writes.';

-- Unreachable by any client role — writing the discount/price columns must not gain an RPC
-- surface (Round 1 / Round 5 closed the client write path). Only the trusted server action's
-- service-role client calls it.
revoke all on function public.set_deal_price(uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.set_deal_price(uuid, numeric, text, uuid) to service_role;
