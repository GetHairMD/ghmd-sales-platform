-- ─────────────────────────────────────────────────────────────────────────────
-- Hard Rule 10 — RLS & SECURITY DEFINER remediation
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network) is never touched.
--
-- WHAT: closes the get_advisors (security) `rls_policy_always_true` findings on
-- the 7 core tables whose Sprint 1/2 policies were
-- `FOR ALL TO authenticated USING (true) WITH CHECK (true)` — i.e. any signed-in
-- user had unrestricted CRUD. (Sprint 1 foundation itself flagged these
-- "tighten Sprint 2".)
--
-- DESIGN (Trace-directed 2026-07-08; Category 2+, Second-Opinion Gate applies):
--   Introduce an `internal_users` allow-list with an executive/rep designation.
--   The 4 rep-facing tables (prospects, deals, activities, territories) are read
--   AND written as the `authenticated` role across the whole app — SSR pages use
--   the anon key + session cookies, so they are RLS-subject, plus there are
--   direct browser writes (ActivityLog insert, DealStatusSelector /
--   FundingPrequalToggle updates, prospects/new insert). They are therefore
--   gated on ALLOW-LIST MEMBERSHIP, not on executive-level, which closes the
--   "any authenticated user" hole WITHOUT breaking reps. The 3 server-only
--   tables (call_scores [Phase 2, unbuilt], spoke_candidates, outreach_touches)
--   have zero client/SSR call sites, so their blanket policy is dropped outright
--   → service-role-only (RLS fails closed; policies added when client access is
--   actually built, per the decision #58 pattern).
--
--   `executive` is the ONLY role this pass introduces (per brief). Full per-rep
--   row scoping is the future RBAC project — explicitly out of scope here.
--
-- NOT CHANGED (accepted dispositions; Chat logs to ops.decision_log, not Coder):
--   • gate_decision_for_pr — anon EXECUTE is intentional: the Second-Opinion
--     Gate CI calls it as the anon role; it is a narrow SECURITY DEFINER accessor
--     that can execute but cannot read ops.decision_log. Retained by design.
--   • rls_auto_enable — returns event_trigger, not RPC-invocable (decision #64).
--   • st_estimatedextent — postgis extension-owned (parallel to spatial_ref_sys,
--     decision #92); cannot be altered without breaking the extension.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Allow-list of provisioned internal users.
create table if not exists public.internal_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  designation text not null default 'rep' check (designation in ('executive', 'rep')),
  created_at  timestamptz not null default now()
);

alter table public.internal_users enable row level security;

-- A signed-in user may read their OWN membership row — this is what lets the
-- allow-list EXISTS() checks below run as the authenticated role. Membership is
-- managed by service-role / migrations only: no client insert/update/delete.
drop policy if exists "self_read" on public.internal_users;
create policy "self_read" on public.internal_users
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.internal_users to authenticated;

-- 2. Seed membership BEFORE swapping policies (same migration) so no provisioned
-- user loses access on deploy. Trace-directed seed: every current auth user is an
-- executive (single-principal today). Runs as the privileged migration role.
insert into public.internal_users (user_id, designation)
  select id, 'executive' from auth.users
  on conflict (user_id) do nothing;

-- 3. Rep-facing tables → gate on allow-list membership. Preserves access for
-- provisioned users (reps + execs); closes the always-true hole. Service-role
-- server code bypasses RLS and is unaffected.
--   prospects / deals / territories carry "authenticated_all";
--   activities carries "authenticated_full_access".
drop policy if exists "authenticated_all"         on public.prospects;
drop policy if exists "authenticated_all"         on public.deals;
drop policy if exists "authenticated_all"         on public.territories;
drop policy if exists "authenticated_full_access" on public.activities;

create policy "internal_users_all" on public.prospects
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid())))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid())));

create policy "internal_users_all" on public.deals
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid())))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid())));

create policy "internal_users_all" on public.territories
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid())))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid())));

create policy "internal_users_all" on public.activities
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid())))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid())));

-- 4. Server-only tables → drop the blanket policy. No client/SSR access exists,
-- so RLS now fails closed for anon/authenticated; service-role writes bypass RLS.
drop policy if exists "authenticated_all" on public.call_scores;
drop policy if exists "authenticated_all" on public.spoke_candidates;
drop policy if exists "authenticated_all" on public.outreach_touches;
