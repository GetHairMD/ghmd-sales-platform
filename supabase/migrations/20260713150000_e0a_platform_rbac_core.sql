-- ─────────────────────────────────────────────────────────────────────────────
-- E-0a — Platform RBAC Core: rep-identity foundation on internal_users.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Decision log: #150 (Session E / Platform RBAC scoping pass).
--
-- WHAT this migration does — and, deliberately, does NOT do:
--   1. Adds internal_users.full_name (text, NULLABLE) — a display name for reps,
--      set by Trace at rep-provisioning time (see CLAUDE.md "Rep provisioning").
--      Existing rows are NOT backfilled; every UI consumer must render gracefully
--      on NULL (never crash, never show "null").
--   2. Idempotently ensures the designation domain CHECK (executive|rep). This
--      constraint ALREADY EXISTS live as `internal_users_designation_check`
--      (added with the qualification-gate work) — verified this session, 0
--      violating rows. The guard below is a no-op against the live DB and exists
--      only so this migration is self-contained and correct in a fresh rebuild.
--
-- WHAT stays untouched (confirmed already-correct this session, per brief §2 —
-- "confirm, don't rebuild"):
--   • prospects RLS. The target model is already live from the qualification-gate
--     migration: `exec_all` (FOR ALL — internal_users.designation='executive')
--     and `rep_read_own` (FOR SELECT — assigned_rep_id = (select auth.uid())).
--     There is NO broad "all-authenticated sees all" PERMISSIVE policy to defeat
--     rep-siloing (the §2 hazard does not exist here). RLS is enabled (not forced,
--     so server-side service_role reads still bypass — intentional). No new
--     prospects policy is added, replaced, or dropped by this migration.
--   • assigned_rep_id is already a real FK to auth.users (qualification-gate). Its
--     population on new prospect creation is an application-layer change
--     (src/lib/prospect-insert.ts + prospects/new), not a schema change.
--
-- Both `supabase db push` and MCP apply_migration wrap each migration in a
-- transaction automatically — no explicit begin/commit needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. internal_users.full_name — nullable rep display name ──────────────────
alter table public.internal_users
  add column if not exists full_name text;

comment on column public.internal_users.full_name is
  'Display name for the internal user (primarily reps), set by Trace at provisioning '
  'time (CLAUDE.md "Rep provisioning"). Nullable: existing rows are not backfilled and '
  'reps may be provisioned before a name is supplied. Every consumer must render '
  'gracefully on NULL (fall back to a generic label), never crash or display "null".';

-- ── 2. Idempotent designation domain guard (executive|rep) ───────────────────
-- No-op live: `internal_users_designation_check` already enforces exactly this.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.internal_users'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%designation%'
  ) then
    alter table public.internal_users
      add constraint internal_users_designation_check
      check (designation in ('executive', 'rep'));
  end if;
end $$;
