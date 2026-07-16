-- ─────────────────────────────────────────────────────────────────────────────
-- §4D Rep Command Center — discount-governance data model (decision #169).
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (kjweckggegifjmmqccul) is never touched.
--
-- Formalizes the discount-authorization practice Trace confirmed as ordinary
-- commercial pricing discretion (ops.decision_log #169, legal_flag: false,
-- residual_risk: none — Trace's call, 2026-07-14). Adds:
--   §1  deals.discount_reason + deals.discount_authorized_by
--   §2  CHECK: discount_reason domain (spec's four categories + other)
--   §3  CHECK: discount economics — a below-list deal without BOTH fields fails
--   §4  discount_authorizing_designations (seeded 'executive'; no client access)
--   §5  validate_deal_discount_authorization() BEFORE INSERT/UPDATE trigger —
--       the cross-table designation check a CHECK constraint cannot express
--   §6  column lockdown: the two discount columns are removed from EVERY
--       authenticated column grant (SELECT + INSERT + UPDATE) — the E-1
--       funded_won_at pattern, extended from UPDATE-only to all three verbs
--
-- Pre-flight against the live table (2026-07-16): 7 deals, 0 with
-- territory_price NULL, 0 below 179000 — no existing row violates §3, so no
-- backfill decision arises.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Discount columns ──────────────────────────────────────────────────────
alter table public.deals
  add column if not exists discount_reason text,
  add column if not exists discount_authorized_by uuid references auth.users(id);

comment on column public.deals.discount_reason is
  'Why this deal closed below the $179,000 list price (decision #169): '
  'speed_to_close | kol_political_sway | strategic_deal | multi_territory | other. '
  'NULL on undiscounted deals. NOT client-readable or client-writable for ANY '
  'designation — the authenticated role''s column grants exclude it (§6); it is read '
  'and written exclusively through server-side service_role paths (the executive-only '
  'Rep Command Center reads it; discount entry is a Trace-directed server-side write). '
  'Kept in lockstep with DISCOUNT_REASONS in src/lib/rep-command-center/metrics.ts.';
comment on column public.deals.discount_authorized_by is
  'auth.users.id of the person who authorized the discount. Must hold a designation '
  'present in discount_authorizing_designations at the time it is set — enforced by '
  'validate_deal_discount_authorization() (§5), because a CHECK cannot do a cross-table '
  'lookup. Same client lockdown as discount_reason (§6).';

-- ── 2. Reason domain CHECK ───────────────────────────────────────────────────
-- Separate idempotent block: `add column if not exists` will not attach a CHECK
-- on re-run (same shape as E-2's status CHECK).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.deals'::regclass
      and conname  = 'deals_discount_reason_check'
  ) then
    alter table public.deals
      add constraint deals_discount_reason_check
      check (
        discount_reason is null
        or discount_reason in
          ('speed_to_close','kol_political_sway','strategic_deal','multi_territory','other')
      );
  end if;
end $$;

-- ── 3. Discount-economics CHECK (spec §4D, verbatim shape) ───────────────────
-- A discounted deal (below the $179,000 list price) without BOTH a reason and an
-- authorizer fails at the database. The 179000 literal here is pinned to the TS
-- single-source constant (TERRITORY_STANDARD_PRICE, components/proposal/constants.ts)
-- by a source-scan test — SQL cannot import it, so the test is the drift guard.
--
-- KNOWN NULL SEMANTICS (flagged, not silently "fixed"): territory_price is nullable
-- with default 179000.00. For a NULL price this CHECK evaluates NULL and therefore
-- PASSES without requiring the discount fields (SQL three-valued logic: a CHECK is
-- violated only on FALSE). Live data has zero NULL prices and the column default
-- makes one hard to produce; tightening territory_price to NOT NULL is a separate
-- schema decision this migration deliberately does not smuggle in.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.deals'::regclass
      and conname  = 'deals_discount_requires_authorization_check'
  ) then
    alter table public.deals
      add constraint deals_discount_requires_authorization_check
      check (
        territory_price >= 179000
        or (discount_reason is not null and discount_authorized_by is not null)
      );
  end if;
end $$;

-- ── 4. Authorizing-designations registry ─────────────────────────────────────
-- Which internal_users.designation values may appear behind discount_authorized_by.
-- Seeded with 'executive'. Rows are added/removed ONLY by Trace directing Coder
-- (manual-provisioning discipline, Hard Rule 6) — deliberately NOT a UI-managed
-- CRUD surface, and deliberately invisible to clients: RLS enabled with NO
-- policies and zero anon/authenticated grants (the proposal_events /
-- resource_engagement_events service-role-only pattern). Only §5's SECURITY
-- DEFINER trigger and server-side service_role paths read it.
create table if not exists public.discount_authorizing_designations (
  designation text primary key,
  added_by    uuid references auth.users(id),
  added_at    timestamptz not null default now()
);

alter table public.discount_authorizing_designations enable row level security;
revoke all on public.discount_authorizing_designations from anon, authenticated;

comment on table public.discount_authorizing_designations is
  'Designations allowed to authorize below-list deals (decision #169). Seeded with '
  '''executive''. Service-role/postgres only — RLS enabled, no policies, no client '
  'grants. Managed manually by Trace directing Coder (Hard Rule 6 discipline); '
  'checked by validate_deal_discount_authorization() on deals writes.';

-- FK support indexes (advisor hygiene; deals.discount_authorized_by is sparse).
create index if not exists deals_discount_authorized_by_idx
  on public.deals (discount_authorized_by)
  where discount_authorized_by is not null;
create index if not exists discount_authorizing_designations_added_by_idx
  on public.discount_authorizing_designations (added_by);

-- Seed. Idempotent; never clobbers an existing row's audit columns.
insert into public.discount_authorizing_designations (designation)
values ('executive')
on conflict (designation) do nothing;

-- ── 5. Cross-table authorization trigger ─────────────────────────────────────
-- Same class as stamp_community_board_review(): a data rule RLS/CHECK cannot
-- express. Differences, both deliberate:
--   • SECURITY DEFINER (stamp_community_board_review is INVOKER because it must
--     read the CALLING user''s auth.uid(); this function reads no caller identity —
--     it must read internal_users, whose only client SELECT policy is self_read,
--     and the no-policy registry above, so it needs the definer''s (postgres) view
--     of both tables to validate a row REGARDLESS of who is writing).
--   • Fires the lookup only when discount_authorized_by is SET (INSERT with a
--     value, or UPDATE that CHANGES the value). An already-authorized deal is not
--     re-validated on unrelated UPDATEs — removing a designation from the registry
--     later must not brick every subsequent write to historically-authorized deals
--     (the authorization was valid when given; supersede-never-delete ethos).
create or replace function public.validate_deal_discount_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.discount_authorized_by is not null
     and (tg_op = 'INSERT'
          or new.discount_authorized_by is distinct from old.discount_authorized_by) then
    if not exists (
      select 1
      from public.internal_users iu
      join public.discount_authorizing_designations dad
        on dad.designation = iu.designation
      where iu.user_id = new.discount_authorized_by
    ) then
      raise exception
        'deals.discount_authorized_by (%) does not hold an authorizing designation (decision #169)',
        new.discount_authorized_by
        using errcode = '23514'; -- check_violation: surfaces like the §3 CHECK to callers
    end if;
  end if;
  return new;
end;
$$;

comment on function public.validate_deal_discount_authorization() is
  'BEFORE INSERT/UPDATE on deals (§4D, decision #169). When discount_authorized_by is '
  'set (insert with value, or update changing it), confirms that user''s '
  'internal_users.designation is present in discount_authorizing_designations; raises '
  'check_violation otherwise. SECURITY DEFINER so the cross-table lookup sees truth '
  'regardless of the writing role (internal_users is self_read-only to clients; the '
  'registry has no client access at all). Unrelated UPDATEs of an already-authorized '
  'deal are NOT re-validated — a later registry change never invalidates history.';

-- Trigger invocation does not check EXECUTE; revoking closes the PostgREST RPC
-- surface with zero effect on firing (E-2 discipline).
revoke all on function public.validate_deal_discount_authorization() from public, anon, authenticated;

drop trigger if exists deals_validate_discount_authorization on public.deals;
create trigger deals_validate_discount_authorization
  before insert or update on public.deals
  for each row
  execute function public.validate_deal_discount_authorization();

-- ── 6. Column lockdown — discount columns leave the client surface entirely ──
-- E-1's funded_won_at lesson, applied to BOTH new columns and THREE verbs: a
-- table-level grant covers every column (including future ones), and column
-- REVOKEs do not subtract from it. So: drop the table-level SELECT/INSERT/UPDATE
-- grants and re-grant column-level on every column EXCEPT the two discount
-- columns. Result for ANY authenticated client (rep or executive alike):
--   • SELECT of either discount column → permission denied (concealment: §4D reads
--     happen only in the executive-gated, service-role-backed Rep Command Center);
--   • INSERT/UPDATE naming either column → permission denied (a rep cannot set
--     discount_authorized_by to themselves or anyone else — it never reaches the
--     trigger);
--   • `select *` on deals via PostgREST would fail — verified: every deals read in
--     src/** names explicit columns (no `select('*')` sites exist).
-- DELETE is untouched (no column dimension; scope unchanged). service_role bypasses
-- grants and RLS but NOT the §3 CHECK or §5 trigger.
--
-- NOTE (maintenance, mirrors 20260714153000): any future deals column the app must
-- read/write via the authenticated client needs an explicit column grant here-after —
-- table-level SELECT/INSERT/UPDATE are intentionally no longer held.
revoke select, insert, update on public.deals from authenticated;

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name)
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'deals'
    and column_name not in ('discount_reason', 'discount_authorized_by');

  execute format(
    'grant select (%1$s), insert (%1$s), update (%1$s) on public.deals to authenticated',
    v_cols
  );
end
$$;
