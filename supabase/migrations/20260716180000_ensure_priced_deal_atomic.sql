-- ─────────────────────────────────────────────────────────────────────────────
-- §4D Round 6 — close the concurrent-close double-deal race in moveProspectStage.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP never touched.
--
-- THE RACE (distinct from Round 5's territory_price lockdown — different root, found
-- by a separate gate run against the Round 5 commit): moveProspectStage()'s Round-3
-- standard-price backstop is a check-then-act across TWO PostgREST round-trips with no
-- lock/transaction between them:
--     select id from deals where prospect_id=X limit 1;   -- round-trip 1
--     if none: insert deal (X, 179000);                   -- round-trip 2
-- Two near-simultaneous closes of the SAME prospect (double-click, retry after a
-- network blip, two sessions) can both read "no deal" before either inserts, and BOTH
-- insert a $179,000 deal. There is deliberately NO unique constraint on
-- deals.prospect_id (Round 4 preserved multi-territory customers), so the second insert
-- succeeds cleanly → one real close, two deals, double-counted gross/net in the Rep
-- Command Center. The adjacent stage stamp is NOT affected: stamp_prospect_funded_won()
-- is BEFORE UPDATE OF stage, and row-level locking on the prospects UPDATE already
-- serializes two concurrent stage updates.
--
-- THE FIX: move the check-and-insert into ONE function that first takes a row lock on
-- the prospect, so the two steps run inside a single transaction and are serialized
-- per prospect. A second concurrent call blocks on the lock until the first commits,
-- then its check sees the first's committed insert (READ COMMITTED per-statement
-- snapshot) and skips. Not a unique constraint (would break multi-territory customers,
-- Round 4), not a client-side debounce (doesn't cover retries / two sessions).
--
-- SECURITY INVOKER (not DEFINER) — deliberate: it must run under the CALLING user's own
-- grants/RLS, exactly like the client-side insert it replaces, so no service-role
-- escalation is introduced. Verified live against the policies:
--   • exec_all (ALL commands) lets an EXECUTIVE take the FOR UPDATE lock. Executives are
--     the ONLY callers who can complete a close: prospects has no rep UPDATE policy
--     (rep_read_own is SELECT-only), so a rep's stage UPDATE no-ops under RLS and a rep
--     cannot cause the double-close race. The lock therefore engages for exactly the
--     callers who can race.
--   • A rep's rep_read_own (SELECT-only) does NOT permit SELECT ... FOR UPDATE, so the
--     lock line returns 0 rows for a rep — harmless: the function still runs its
--     check+insert under internal_users_all, which is the SAME exposure a rep already
--     has via the direct client insert today. No new privilege; only atomicity is added
--     for the callers who can race.
--
-- The 179000 literal is the non-negotiable standard price (TERRITORY_STANDARD_PRICE,
-- components/proposal/constants.ts) — SQL can't import it; pinned to the constant by a
-- source-scan test, matching the CHECK / backfill literals in prior migrations.
--
-- New migration; 20260716120000 / 140000 / 160000 are applied and NOT edited.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ensure_priced_deal(p_prospect_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deal_id uuid;
begin
  -- 1. Lock the prospect row FIRST — closes the race window. A concurrent call for the
  --    same prospect blocks here until this transaction commits. For a caller whose RLS
  --    does not permit FOR UPDATE (a rep), this returns 0 rows and acquires no lock —
  --    acceptable, since such a caller cannot complete a close anyway (see header).
  perform 1 from public.prospects where id = p_prospect_id for update;

  -- 2. Same existence check as the old inline code, now inside the locked window.
  select id into v_deal_id
  from public.deals
  where prospect_id = p_prospect_id
  limit 1;

  -- 3. Only insert the standard-price backstop deal if none exists. Never overwrites an
  --    existing (possibly negotiated) deal — identical to the old behaviour.
  if v_deal_id is null then
    insert into public.deals (prospect_id, territory_price)
    values (p_prospect_id, 179000)
    returning id into v_deal_id;
  end if;

  return v_deal_id;
end;
$$;

comment on function public.ensure_priced_deal(uuid) is
  'Atomically guarantees a priced deals row exists for a prospect (§4D Round 6). Locks '
  'the prospect row FOR UPDATE, then check-and-inserts a $179,000 standard-price deal only '
  'if none exists — serializing concurrent closes of the same prospect so a double-click / '
  'retry / two sessions cannot create two backstop deals. SECURITY INVOKER: runs under the '
  'caller''s grants/RLS (no service-role escalation), exactly like the client insert it '
  'replaces in moveProspectStage(). The FOR UPDATE lock engages for executives (exec_all), '
  'the only callers who can complete a close. Never overwrites an existing deal.';

-- SECURITY INVOKER + EXECUTE to authenticated does NOT widen privilege — it only adds
-- atomicity to an insert `authenticated` can already perform directly (internal_users_all).
revoke all on function public.ensure_priced_deal(uuid) from public;
grant execute on function public.ensure_priced_deal(uuid) to authenticated;
