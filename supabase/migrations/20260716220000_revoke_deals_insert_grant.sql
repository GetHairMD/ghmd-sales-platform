-- ─────────────────────────────────────────────────────────────────────────────
-- §4D Round 8 — remove the raw client INSERT grant on deals (revenue fabrication).
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP never touched.
--
-- THE HOLE (fully deterministic — no race, unlike Rounds 6/7): `authenticated` has
-- always held a column-level INSERT grant on deals (Round 1 re-granted it for the
-- legitimate standard-price backstop). Combined with the single internal_users_all RLS
-- policy (no ownership check), ANY rep — on ANY prospect, their own or not, any number
-- of times — can run, straight at the table:
--     insert into public.deals (prospect_id, territory_price) values (<prospect>, 179000);
-- and it succeeds, bypassing ensure_priced_deal() and set_deal_price() entirely (verified
-- live as QA Rep A on a prospect not even assigned to them). Since Round 4 sums EVERY deal
-- row per customer, each spurious insert directly inflates that rep's gross/net/deal-count
-- on the executive Rep Command Center. Rounds 6–7 added safe atomic FUNCTIONS but never
-- touched the underlying grant those functions were meant to be the only door to.
--
-- THE FIX (two dependent pieces, shipped together):
--   §1  Convert ensure_priced_deal() from SECURITY INVOKER to SECURITY DEFINER. It
--       currently inserts under the CALLER's INSERT grant; once that grant is gone (§2)
--       it must run with its own owner privilege instead, or every legitimate close
--       breaks. Its safety property is UNCHANGED — it still inserts only when zero deals
--       exist for the prospect, behind the same prospects FOR UPDATE lock — so DEFINER
--       does not weaken it. EXECUTE stays granted to authenticated (unchanged from Round
--       6; that grant was never the problem). set_deal_price() needs no change — already
--       SECURITY DEFINER, already service_role-only.
--   §2  Revoke authenticated's INSERT on deals, fully. After this the ONLY ways to create
--       a deals row are ensure_priced_deal() (close backstop) and set_deal_price() (exec
--       price entry) — both DEFINER, both refusing a second insert once any deal exists.
--
-- Live pre-flight (2026-07-16): authenticated held column-level INSERT on 15 deals columns
-- (all but the Round-1-locked discount pair) and NO table-level INSERT. PostgreSQL does not
-- guarantee a table-level REVOKE retracts column-level grants, so §2 revokes INSERT
-- column-by-column across EVERY column (guaranteed-complete) AND at the table level.
-- Verified by re-querying information_schema.role_column_grants after apply: zero remain.
--
-- OUT OF SCOPE, FLAGGED (do NOT fix here): the same audit found `authenticated` also holds
-- table-level DELETE and TRUNCATE on deals (a rep can delete deal rows via
-- internal_users_all, and TRUNCATE bypasses RLS entirely). That is a DESTRUCTIVE class,
-- distinct from this round's fabrication fix, and the gate did not flag it — recommended as
-- an immediate follow-up round, not a silent drive-by here. See the PR body.
--
-- New migration; 120000/140000/160000/180000/200000 are applied and NOT edited.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ensure_priced_deal(): SECURITY INVOKER → SECURITY DEFINER ─────────────
-- Body is identical to migration 20260716180000 except `security invoker` → `security
-- definer`. It now inserts under its owner's privilege, so it keeps working after §2.
create or replace function public.ensure_priced_deal(p_prospect_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal_id uuid;
begin
  -- Lock the prospect row first — closes the concurrent-close race (Round 6). Under
  -- DEFINER this runs as the owner (bypassing RLS), which does not change the lock's
  -- blocking behaviour: it still serializes against set_deal_price()'s lock on the same row.
  perform 1 from public.prospects where id = p_prospect_id for update;

  select id into v_deal_id
  from public.deals
  where prospect_id = p_prospect_id
  limit 1;

  -- UNCHANGED safety property: insert only when NO deal exists — this is exactly what
  -- makes the raw-grant removal safe, since this becomes one of only two insert doors.
  if v_deal_id is null then
    insert into public.deals (prospect_id, territory_price)
    values (p_prospect_id, 179000)
    returning id into v_deal_id;
  end if;

  return v_deal_id;
end;
$$;

comment on function public.ensure_priced_deal(uuid) is
  'Atomically guarantees a priced deals row exists for a prospect (§4D Round 6; SECURITY '
  'DEFINER as of Round 8). Locks the prospect row FOR UPDATE, then check-and-inserts a '
  '$179,000 standard-price deal only if none exists. SECURITY DEFINER so it can insert after '
  'Round 8 removed authenticated''s raw INSERT grant on deals; EXECUTE remains granted to '
  'authenticated (the sole caller is moveProspectStage). Insert-only-when-zero-deals guard '
  'unchanged. Never overwrites an existing deal.';

-- EXECUTE stays granted to authenticated (Round 6); anon must NOT hold it — under DEFINER
-- an anon caller's insert would run as the owner (a real unauthenticated deal-write vector;
-- under the old INVOKER mode it failed harmlessly for lack of anon's INSERT grant). Supabase's
-- default privileges grant `anon` EXECUTE separately from `public`, so revoking from `public`
-- alone is NOT enough — `anon` must be named explicitly (this is why set_deal_price/Round 7
-- named it too). Verified live: has_function_privilege('anon', …) is false after this.
revoke all on function public.ensure_priced_deal(uuid) from public, anon;
grant execute on function public.ensure_priced_deal(uuid) to authenticated;

-- ── 2. Revoke authenticated INSERT on deals — the raw fabrication path ────────
-- Column-by-column across every column (guaranteed to clear column-level grants
-- regardless of the table-level revoke's cascade behaviour), then table-level for
-- completeness. The two DEFINER functions above insert under owner privilege and are
-- unaffected; service_role (set_deal_price) bypasses grants entirely.
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'deals';

  execute format('revoke insert (%s) on public.deals from authenticated', v_cols);
end
$$;

revoke insert on public.deals from authenticated;
