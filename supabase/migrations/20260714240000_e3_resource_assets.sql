-- ─────────────────────────────────────────────────────────────────────────────
-- E-3 — Resource Library ("Field Kit"): resource_assets (Session E, module 3).
-- Decision #159 (Session E sequence). Spec: docs/SALES-OS-SPEC.md §4C.3.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- WHAT this migration does:
--   The catalogue of APPROVED collateral. One row per asset, in one of six
--   categories (spec §4C.3). This session ships the STRUCTURE only — no real
--   content — so the table is created empty and every category renders a genuine
--   empty state. Real collateral is Trace's separate content-production checklist.
--
-- ── RLS MODEL (mirrors the community_board_posts exemplar, 20260714170100) ────
--   • WRITE is executive-only: an executive INSERTs/UPDATEs; there is NO client
--     DELETE path (soft-delete via the `active` flag, matching "a rejected post is
--     retained, not erased"). A rep has no write policy at all → RLS-denied.
--   • READ splits: an executive sees every row; every other internal user (rep)
--     sees only `active = true`. Postgres ORs permissive policies, so the two
--     SELECT policies compose to exactly that.
--   • The grant layer is SEPARATE from RLS and set deliberately: `authenticated`
--     is granted select/insert/update (coarse — "this ROLE may attempt it"); the
--     policies do the real gating ("…only these rows, only an executive"). anon is
--     fully revoked. DELETE/TRUNCATE stay revoked for every client role.
--
-- Both `supabase db push` and MCP apply_migration wrap each migration in a
-- transaction automatically — no explicit begin/commit needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Table ─────────────────────────────────────────────────────────────────
create table if not exists public.resource_assets (
  id            uuid primary key default gen_random_uuid(),
  category      text not null,
  title         text not null,
  description   text,
  asset_type    text not null,
  -- external_url carries pdf | link | doc targets; wistia_id carries wistia_video.
  external_url  text,
  wistia_id     text,
  version       text,
  approved_date date,
  approved_by   uuid references auth.users(id),
  -- Soft-delete flag: reps see active = true only; an executive retires an asset by
  -- setting active = false (never a hard DELETE — the record is retained).
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- CHECK constraints added idempotently on their own (add-column-if-not-exists will
-- not re-attach a CHECK on a re-run, and `create table if not exists` skips them if
-- the table already exists). These two CHECKs are the DB half of the lock-step with
-- src/lib/resources/resources.ts (RESOURCE_CATEGORIES / RESOURCE_ASSET_TYPES); a
-- Vitest test asserts the two lists agree.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.resource_assets'::regclass
      and conname  = 'resource_assets_category_check'
  ) then
    alter table public.resource_assets
      add constraint resource_assets_category_check
      check (category in (
        'decks','testimonial_videos','case_studies',
        'clinical_evidence','business_opportunity','objection_playbook'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.resource_assets'::regclass
      and conname  = 'resource_assets_asset_type_check'
  ) then
    alter table public.resource_assets
      add constraint resource_assets_asset_type_check
      check (asset_type in ('pdf','wistia_video','link','doc'));
  end if;
end $$;

-- The grid reads active assets grouped by category; the exec catalogue reads all.
create index if not exists resource_assets_category_active_idx
  on public.resource_assets (category, active);

-- ── 2. updated_at maintenance ────────────────────────────────────────────────
-- A minimal BEFORE UPDATE trigger keeps updated_at honest regardless of what the
-- client sends. SECURITY INVOKER (default) is fine — it touches no auth.uid().
create or replace function public.resource_assets_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;  -- created_at is immutable
  return new;
end;
$$;
revoke all on function public.resource_assets_set_updated_at() from public, anon, authenticated;

drop trigger if exists resource_assets_set_updated_at on public.resource_assets;
create trigger resource_assets_set_updated_at
  before update on public.resource_assets
  for each row
  execute function public.resource_assets_set_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
alter table public.resource_assets enable row level security;

grant select, insert, update on public.resource_assets to authenticated;
revoke delete, truncate on public.resource_assets from authenticated;
revoke all on public.resource_assets from anon;

-- SELECT — executive sees everything.
drop policy if exists resource_assets_select_executive_all on public.resource_assets;
create policy resource_assets_select_executive_all
  on public.resource_assets
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  );

-- SELECT — any internal user (i.e. a rep) sees only active rows. ORs with the
-- executive policy above, so an executive still sees inactive rows via that one.
drop policy if exists resource_assets_select_active_internal on public.resource_assets;
create policy resource_assets_select_active_internal
  on public.resource_assets
  as permissive
  for select
  to authenticated
  using (
    active = true
    and exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
    )
  );

-- INSERT — executive only. A rep has no INSERT policy → RLS-denied (AC3).
drop policy if exists resource_assets_insert_executive on public.resource_assets;
create policy resource_assets_insert_executive
  on public.resource_assets
  as permissive
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  );

-- UPDATE — executive only (this is how an asset is edited or soft-deleted via
-- active=false). A rep has no UPDATE policy → RLS-denied (AC3).
drop policy if exists resource_assets_update_executive on public.resource_assets;
create policy resource_assets_update_executive
  on public.resource_assets
  as permissive
  for update
  to authenticated
  using (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  )
  with check (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  );

-- No DELETE policy, and DELETE is revoked at the grant layer. Retire via active=false.

comment on table public.resource_assets is
  'Resource Library / Field Kit catalogue (E-3, spec §4C.3). One row per APPROVED '
  'collateral asset in one of six categories. WRITE is executive-only (INSERT/UPDATE); '
  'reps have no write policy. READ: an executive sees every row; a rep sees active=true '
  'only. There is NO client DELETE — an asset is retired by setting active=false '
  '(retained, not erased). Ships empty in E-3 (structure only); real content is a '
  'separate content-production track owned by Trace.';
