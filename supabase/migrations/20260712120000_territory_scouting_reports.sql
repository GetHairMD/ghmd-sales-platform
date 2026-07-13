-- ─────────────────────────────────────────────────────────────────────────────
-- Territory Scouting — executive-only, deal-independent sizing reports
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Decision log: #146 (build pre-authorized, ADOPTED, residual_risk=accepted).
--
-- WHAT: one new table, territory_scouting_reports, that records an executive's
--   ad-hoc "scout this location" request and links it to the v3 drive-time sizing
--   job that computes its addressable market. This is a STANDALONE capability —
--   architecturally distinct from the New Territory flow (PR #114 / /territories/new),
--   which creates a real, eventually-rep-visible deal-track `territories` row.
--
-- HARD CONSTRAINTS (decision #146 — baked in, not re-litigated here):
--   • Separate table, NEVER a status value or flag on `territories`. Every existing
--     rep-facing consumer of `territories` (Deal Territories list, TopBar search,
--     territory_status_map()) has no status filter — piggybacking on that table would
--     repeat a leak class this codebase has already shipped (and reactively fixed)
--     twice (National Map, Deal Territories list).
--   • Executive-only for v1. internal_users has exactly one designation value in
--     production use today ('executive') — no broader-access concept is built.
--   • Never rep-visible, never on the National Map, never promoted to a real
--     territory. No convert-to-territory action exists in v1.
--
-- The compute RESULT itself lives on territory_sizing_jobs.result (service-role-only,
-- RLS-enabled/no-policy — confirmed live this session). This table is only the
-- exec-readable request/report record; server routes read the job through the
-- service client and enforce the executive gate IN CODE (the jobs table has no
-- policy to gate them). Authorization for THIS table's rows is enforced by the
-- exec_all RLS policy below, since the routes read/write it through the ordinary
-- authenticated SSR client.
--
-- RLS MODEL: exec-only, reusing the exact `exec_all` idiom from
--   20260709120000_qualification_gate_schema_rls.sql (same inline EXISTS shape,
--   same (select auth.uid()) init-plan wrap, same policy name). No rep policy ⇒
--   reps fail closed, identical to qualification_scores / rep_call_grades.
--
-- NOT forcing RLS: server code uses the service_role where it must bypass RLS
-- (the jobs table); this table is reached via the authenticated SSR client so its
-- policy applies. `enable`, never `force` (matches every other table here).
-- ─────────────────────────────────────────────────────────────────────────────

-- Both `supabase db push` and MCP apply_migration wrap each migration in a
-- transaction automatically — no explicit begin/commit needed (mirrors #86/#109).

-- ── 1. Table ─────────────────────────────────────────────────────────────────
create table public.territory_scouting_reports (
  id            uuid primary key default gen_random_uuid(),
  label         text,  -- exec-entered name for the run, e.g. "Denver Metro — West"
  center_lat    numeric not null,
  center_lng    numeric not null,
  location_label text,  -- human-readable resolved location (geocode label or "Manual: lat, lng")
  sizing_job_id uuid references public.territory_sizing_jobs(id) on delete set null,
  requested_by  uuid not null references auth.users(id),
  created_at    timestamptz default now()
);
comment on table public.territory_scouting_reports is
  'Executive-only, deal-independent territory sizing reports (decision #146). Standalone from
   territories — never rep-visible, never on the National Map, never promoted to a real
   territory in v1. The compute result itself lives on territory_sizing_jobs.result (service-
   role-only); this table is the exec-readable request/report record.';
create index territory_scouting_reports_requested_by_idx on public.territory_scouting_reports(requested_by);
create index territory_scouting_reports_sizing_job_id_idx on public.territory_scouting_reports(sizing_job_id);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
alter table public.territory_scouting_reports enable row level security;  -- enable, never force

-- anon is never a legitimate reader of scouting data — revoke its grants so it is
-- blocked at the privilege layer too, not RLS alone (matches the qualification-gate
-- posture). authenticated keeps its grant; the exec_all policy gates reps out.
revoke all on public.territory_scouting_reports from anon;

-- Exec-only: single policy; no rep policy ⇒ reps fail closed. Same idiom as
-- qualification_scores / qualification_enrichment / rep_call_grades.
create policy "exec_all" on public.territory_scouting_reports
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'));
