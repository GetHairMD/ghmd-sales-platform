-- ─────────────────────────────────────────────────────────────────────────────
-- §4D — enforce "no Funded/Won without a recorded price" at the database.
-- Trace's decision: there must be no way to transfer a deal to Funded/Won unless a
-- price is recorded. This is the DB backstop; the deliberate app-layer recording
-- lives in src/app/(app)/pipeline/actions.ts (standard-price auto-fill) and the
-- executive discount-entry action (src/app/(app)/prospects/[id]/price-actions.ts).
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP never touched.
--
-- Three parts, in dependency order:
--   §1  BACKFILL the 21 legacy Funded/Won demo prospects that have no deal row, so
--       existing data satisfies the new invariant (Trace: backfill $179k). Runs
--       first so §2's NOT NULL and the app's read paths stay consistent.
--   §2  NOT NULL on deals.territory_price (defensive column-level guard; pre-flight
--       confirmed 0 existing NULLs, and the column default 179000 covers new inserts).
--   §3  Replace stamp_prospect_funded_won() to REJECT the stage→Funded/Won crossing
--       unless a priced deals row exists for the prospect. Cross-table check a CHECK
--       constraint cannot express — same class as validate_deal_discount_authorization().
--
-- Pre-flight (live, 2026-07-16): 23 prospects at stage>=11; 21 with no deal row;
-- 0 deals with NULL territory_price; 7 deals total. So §1 inserts 21 rows, §2 is
-- immediately satisfiable, and §3 only ever governs NEW crossings (the 21 legacy
-- rows are already stage>=11 and never re-fire the BEFORE UPDATE OF stage trigger).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Backfill legacy Funded/Won prospects with a standard-price deal ───────
-- $179,000 is the non-negotiable Phase-1 standard price (CLAUDE.md Key Reference
-- Values / TERRITORY_STANDARD_PRICE). These are demo rows closed before any
-- price-recording path existed; a going-forward trigger cannot fix history, so we
-- record the standard price now. territory_id is linked to the prospect's territory
-- when one exists (territories.prospect_id), else NULL (allowed).
--
-- The insert passes the discount constraints untouched: 179000 satisfies the
-- economics CHECK, and discount_authorized_by stays NULL so
-- validate_deal_discount_authorization() short-circuits (no authorizer to check).
insert into public.deals (prospect_id, territory_id, territory_price)
select
  p.id,
  (select t.id from public.territories t where t.prospect_id = p.id order by t.sold_at nulls last, t.id limit 1),
  179000
from public.prospects p
where p.stage >= 11
  and not exists (select 1 from public.deals d where d.prospect_id = p.id);

-- ── 2. deals.territory_price NOT NULL ────────────────────────────────────────
-- Cheap, unambiguous column-level guard for the "row exists but price is null"
-- case (which the cross-table trigger in §3 also covers via `is not null`, belt +
-- suspenders). Safe now: §1 leaves zero NULLs and the column default is 179000.
alter table public.deals
  alter column territory_price set not null;

-- ── 3. Reject Funded/Won without a priced deal ───────────────────────────────
-- CREATE OR REPLACE (supersede-never-delete: the original creating migration is not
-- edited). This is the SAME BEFORE UPDATE OF stage trigger function that already
-- stamps funded_won_at and marks the territory sold; we prepend the invariant guard.
-- It fires only on the genuine stage<11 → stage>=11 crossing (see the trigger's WHEN
-- clause), so it governs new closes only and adds no cost to ordinary updates.
--
-- Why a trigger, not a CHECK: the rule spans two tables (prospects transition vs a
-- deals row's price) — a CHECK cannot look across tables. SECURITY DEFINER is kept
-- from the original (it must write territories regardless of the caller's grants);
-- the guard's cross-table SELECT likewise benefits from the definer's view.
--
-- The legitimate close path satisfies this because the app records the price FIRST:
-- moveProspectStage() inserts a standard-price deal (if none) before it updates
-- stage, and the exec discount-entry action writes the negotiated price even earlier.
-- The guard is the backstop that makes the invariant impossible to violate by any
-- other write path (a raw stage UPDATE, a future code path, etc.).
create or replace function public.stamp_prospect_funded_won()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- INVARIANT (Trace): no Funded/Won without a recorded price. Reject the crossing
  -- unless a deal with a non-null territory_price exists for this prospect.
  if not exists (
    select 1 from public.deals d
    where d.prospect_id = new.id
      and d.territory_price is not null
  ) then
    raise exception
      'Cannot move prospect % to Funded/Won: no deal with a recorded territory_price exists. Record a territory price before closing.',
      new.id
      using errcode = '23514'; -- check_violation: surfaces like a constraint failure to callers
  end if;

  new.funded_won_at := now();

  update public.territories
  set status  = 'sold',
      sold_by = new.assigned_rep_id,
      sold_at = new.funded_won_at
  where prospect_id = new.id
    and coalesce(qa_locked, false) = false;

  return new;
end;
$$;

comment on function public.stamp_prospect_funded_won() is
  'BEFORE UPDATE OF stage on prospects (fires on the stage<11 → stage>=11 crossing). '
  'Enforces the "no Funded/Won without a recorded price" invariant (Trace): rejects the '
  'crossing unless a deals row with a non-null territory_price exists for the prospect '
  '(cross-table check a CHECK cannot express). On success, stamps funded_won_at and marks '
  'the linked non-qa-locked territory sold. SECURITY DEFINER (writes territories regardless '
  'of caller grants). The app records the price BEFORE the stage update — standard-price '
  'auto-fill in moveProspectStage(), or the executive discount-entry action — so this is the '
  'backstop, not the primary recording step.';
