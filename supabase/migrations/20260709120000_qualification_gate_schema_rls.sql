-- ─────────────────────────────────────────────────────────────────────────────
-- Qualification Gate — schema retirement/rename + per-rep RLS  (PR1 of the
-- Lead Qualification Gate & Territory-Authoring Precondition build)
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Governing doc: docs/QUALIFICATION-GATE-SCOPING.md (committed in this PR).
-- Decision log: #109 (build), #110 (gate widened to stage-advancement;
-- skipped_triage deprecated-in-place — that portion lands in PR2, not here).
--
-- WHAT (PR1 only — schema + access control; UI/gate/pipeline are PR2–PR4):
--   1. Retire the 0-row `operators` stub cluster (operators / operator_scores /
--      operator_enrichment / operator_score_records) + its dependent view.
--      All 0 rows, no external FKs, no function deps — verified live 2026-07-09.
--   2. Recreate scoring keyed DIRECTLY to prospects.id (operator identity ==
--      prospect identity — no separate persistent entity; Sprint-1 operators
--      build is moot, scoping §3.1):
--        qualification_scores      (14 scored dimensions + composite)
--        qualification_enrichment  (non-scored background context)
--        qualification_reviews     (the decision record; `recommendation` is the
--                                   gate signal)
--        rep_call_grades           (exec-only rep-performance grading; NOT
--                                   call_scores, which stays rep-visible per #53)
--   3. prospects.assigned_rep_id → real FK to auth.users (the existing free-text
--      `assigned_rep` is LEFT in place, unused going forward, not dropped —
--      same deprecation pattern as reserved_for / deals.stage).
--   4. RLS across the five affected tables.
--
-- RLS MODEL (scoping §5 — which WINS over brief PR1 #4's flat "rep sees own"
-- for all five; the brief itself says the doc wins on conflict):
--   exec-only (reps get NOTHING, not even their own — these are the "mechanics"
--   reps must never see, per §1 / Hard-Rule-1 spirit):
--        qualification_scores, qualification_enrichment, rep_call_grades
--   exec-all + rep-own (rep = the prospect's assigned_rep_id):
--        prospects        (rep: READ own leads only — write-scope deferred to PR3;
--                          FOR ALL would open a cascade-delete of exec-only data)
--        qualification_reviews (rep: READ own only; note-writes arrive in PR3
--                               with the UI — recommendation issuance is exec-only)
--   "executive" = internal_users.designation = 'executive'.
--   Pattern EXTENDS decision #105/#86's internal_users_all (same inline EXISTS
--   shape, (select auth.uid()) init-plan wrap) — no new helper/pattern invented.
--
-- SESSION DECISIONS baked in (confirmed by Trace 2026-07-09):
--   • 14 dimensions, not 13 — the standalone `engagement` quad is KEPT alongside
--     `engagement_proxy_textual` (live operator_scores had 14; brief listed 13).
--   • qualification_enrichment is exec-only (§5 was silent; Trace: exec-only).
--   • score_composite carries over (scoping §3.1 "carries over unchanged") but is
--     placed on the EXEC-ONLY qualification_scores, NOT on the rep-readable
--     qualification_reviews — this honors BOTH "composite carries over" and
--     "reps never see the score mechanics" without column-privilege machinery.
--     It is nullable, unpopulated in Phase 1, and explicitly NOT the gate signal.
--   • operator_score_override_rates view is DROPPED (dependency of operator_scores)
--     and NOT recreated — human-override rates are meaningless until Phase-2 AI
--     scoring exists. Recreate over qualification_scores when that lands.
--
-- NOT forcing RLS: server code uses the service_role (SSR + Netlify functions)
-- and MUST bypass RLS — same as every other table here. `enable`, never `force`.
-- ─────────────────────────────────────────────────────────────────────────────

-- Both `supabase db push` and MCP apply_migration wrap each migration in a
-- transaction automatically — no explicit begin/commit needed (mirrors #86).

-- ── 1. Retire the operators stub cluster ────────────────────────────────────
-- Drop the dependent view first (SELECTs operator_scores), then children→parent.
drop view  if exists public.operator_score_override_rates;
drop table if exists public.operator_score_records;
drop table if exists public.operator_scores;
drop table if exists public.operator_enrichment;
drop table if exists public.operators;
-- NB: the `capture_source` enum is intentionally NOT dropped — it is reused
-- verbatim below, which is what keeps Phase 2 (ai_extracted/ai_derived) additive.

-- ── 2. qualification_scores — 14 scored dimensions, keyed to prospects.id ─────
-- Shape carried 1:1 from operator_scores. Each dimension is a quad:
--   *_value / *_source (capture_source) / *_confidence (0..1) / *_notes.
-- Group defaults preserved: B=ai_extracted, C=ai_derived, D=human_entered.
-- v1 UX is edit-in-place (scoping §3.1) → one row per prospect (unique).
create table public.qualification_scores (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null unique references public.prospects(id) on delete cascade,
  session_id   uuid,  -- retained for future multi-session; v1 is edit-in-place

  -- Group B — default ai_extracted
  stated_facts_value              text,
  stated_facts_source             capture_source default 'ai_extracted',
  stated_facts_confidence         numeric check (stated_facts_confidence between 0 and 1),
  stated_facts_notes              text,
  revealed_behavior_value         text,
  revealed_behavior_source        capture_source default 'ai_extracted',
  revealed_behavior_confidence    numeric check (revealed_behavior_confidence between 0 and 1),
  revealed_behavior_notes         text,
  response_classification_value       text,
  response_classification_source      capture_source default 'ai_extracted',
  response_classification_confidence  numeric check (response_classification_confidence between 0 and 1),
  response_classification_notes       text,
  follow_through_language_value       text,
  follow_through_language_source      capture_source default 'ai_extracted',
  follow_through_language_confidence  numeric check (follow_through_language_confidence between 0 and 1),
  follow_through_language_notes       text,
  objections_raised_value         text,
  objections_raised_source        capture_source default 'ai_extracted',
  objections_raised_confidence    numeric check (objections_raised_confidence between 0 and 1),
  objections_raised_notes         text,
  questions_asked_value           text,
  questions_asked_source          capture_source default 'ai_extracted',
  questions_asked_confidence      numeric check (questions_asked_confidence between 0 and 1),
  questions_asked_notes           text,

  -- Group C — default ai_derived
  talk_time_ratio_value           numeric,
  talk_time_ratio_source          capture_source default 'ai_derived',
  talk_time_ratio_confidence      numeric check (talk_time_ratio_confidence between 0 and 1),
  talk_time_ratio_notes           text,
  answer_specificity_value        numeric,
  answer_specificity_source       capture_source default 'ai_derived',
  answer_specificity_confidence   numeric check (answer_specificity_confidence between 0 and 1),
  answer_specificity_notes        text,
  engagement_proxy_textual_value      text,
  engagement_proxy_textual_source     capture_source default 'ai_derived',
  engagement_proxy_textual_confidence numeric check (engagement_proxy_textual_confidence between 0 and 1),
  engagement_proxy_textual_notes      text,

  -- Group D — default human_entered
  affect_energy_value             text,
  affect_energy_source            capture_source default 'human_entered',
  affect_energy_confidence        numeric check (affect_energy_confidence between 0 and 1),
  affect_energy_notes             text,
  coachability_value              text,
  coachability_source             capture_source default 'human_entered',
  coachability_confidence         numeric check (coachability_confidence between 0 and 1),
  coachability_notes              text,
  motivation_authenticity_value       text,
  motivation_authenticity_source      capture_source default 'human_entered',
  motivation_authenticity_confidence  numeric check (motivation_authenticity_confidence between 0 and 1),
  motivation_authenticity_notes       text,
  engagement_value                text,
  engagement_source               capture_source default 'human_entered',
  engagement_confidence           numeric check (engagement_confidence between 0 and 1),
  engagement_notes                text,
  chemistry_fit_value             text,
  chemistry_fit_source            capture_source default 'human_entered',
  chemistry_fit_confidence        numeric check (chemistry_fit_confidence between 0 and 1),
  chemistry_fit_notes             text,

  -- Composite (ex-operator_score_composite). Nullable day-one; populated only
  -- after 6–12 months of outcome validation; never AI-alone; NOT the gate signal.
  -- Lives here (exec-only) so reps never see it.
  score_composite                 numeric check (score_composite is null or score_composite >= 0),

  created_at   timestamptz default now()
);
comment on table public.qualification_scores is
  'Buyer/prospect qualification scoring — 14 dimensions keyed to prospects.id. Exec-only (RLS). Replaces operator_scores. All dims human-entered in Phase 1; _source enum lets Phase-2 AI slot in with zero schema change. One row per prospect (edit-in-place, scoping §3.1).';
create index qualification_scores_prospect_id_idx on public.qualification_scores(prospect_id);

-- ── 3. qualification_enrichment — non-scored background context ──────────────
create table public.qualification_enrichment (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null unique references public.prospects(id) on delete cascade,
  practice_npi  text,  -- stable physician identifier; carried forward from operator_enrichment (Trace, keep-not-drop)
  years_in_practice            integer,
  existing_aesthetic_services  text,
  digital_footprint_present    boolean,
  -- prior evidence they financed comparable capital equipment (financeability
  -- proxy), manually entered like digital_footprint_present (scoping §3.1).
  prior_financing_relationship boolean,
  captured_at   timestamptz default now(),
  source        capture_source default 'enriched'
);
comment on table public.qualification_enrichment is
  'Non-scored qualification background context, keyed to prospects.id. Exec-only (RLS). Replaces operator_enrichment.';
create index qualification_enrichment_prospect_id_idx on public.qualification_enrichment(prospect_id);

-- ── 4. qualification_reviews — the decision record; recommendation is the gate ─
-- Rep-readable surface (recommendation + ai_summary + notes). Deliberately holds
-- NO scored dimensions and NO composite — those live on the exec-only tables.
-- 'conditional' edits this row in place on a follow-up (scoping §3.1) → one row
-- per prospect (unique); PR3 upserts on prospect_id.
create table public.qualification_reviews (
  id            uuid primary key default gen_random_uuid(),
  prospect_id   uuid not null unique references public.prospects(id) on delete cascade,
  session_id    uuid,
  recommendation text check (recommendation in ('proceed','conditional','not_qualified')),
  reviewed_by   uuid references auth.users(id),  -- the exec who issued it
  reviewed_at   timestamptz,
  ai_summary    text,   -- nullable; populated only in Phase 2 (Zoom/AI)
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()  -- app-managed (repo has no updated_at trigger)
);
comment on table public.qualification_reviews is
  'Qualification decision record keyed to prospects.id. recommendation ∈ proceed/conditional/not_qualified is the gate signal (scoping §7, decision #110). Exec issues it; reps READ own (+ notes via PR3). Replaces operator_score_records; capital_status descoped (deal-stage concern), composite moved to qualification_scores.';
create index qualification_reviews_prospect_id_idx on public.qualification_reviews(prospect_id);

-- ── 5. rep_call_grades — exec-only rep-performance grading ───────────────────
-- Separate table by design: call_scores is locked rep-visible (#53); this is the
-- opposite visibility rule, so it is a NEW table, never a change to call_scores.
create table public.rep_call_grades (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references public.prospects(id) on delete cascade,
  deal_id      uuid references public.deals(id) on delete set null,
  graded_by    uuid references auth.users(id),
  call_date    date,
  total_score  integer check (total_score is null or total_score between 0 and 100),
  grade_data   jsonb,
  notes        text,
  created_at   timestamptz default now()
);
comment on table public.rep_call_grades is
  'Exec-only grading of a rep''s call performance (managing/training). Distinct from call_scores (rep-visible self-coaching, decision #53). Graded rep is the prospect''s assigned_rep. Multiple rows per prospect (per call) — no unique.';
create index rep_call_grades_prospect_id_idx on public.rep_call_grades(prospect_id);
create index rep_call_grades_deal_id_idx     on public.rep_call_grades(deal_id);

-- ── 6. prospects.assigned_rep_id → real identity (FK), + index ───────────────
-- Free-text prospects.assigned_rep stays in place (still read by current code);
-- assigned_rep_id is the real per-rep RLS key. Nullable; not backfilled (the
-- text names — e.g. 'leif' — are not auth users). Rep assignment wiring is later.
alter table public.prospects
  add column assigned_rep_id uuid references auth.users(id);
comment on column public.prospects.assigned_rep_id is
  'Real per-rep identity FK (auth.users). RLS key: reps see only rows where assigned_rep_id = auth.uid(). Supersedes free-text assigned_rep (kept, deprecated-in-place). NULL until rep assignment is wired.';
create index prospects_assigned_rep_id_idx on public.prospects(assigned_rep_id);

-- ── 7. RLS ───────────────────────────────────────────────────────────────────
alter table public.qualification_scores      enable row level security;
alter table public.qualification_enrichment  enable row level security;
alter table public.qualification_reviews      enable row level security;
alter table public.rep_call_grades           enable row level security;

-- anon is never a legitimate reader of qualification data — revoke its grants so
-- it is blocked at the privilege layer too, not RLS alone. Matches the tightened
-- posture of prospects/deals/call_scores from the #86 remediation (their closest
-- sensitivity cousins). Surfaced by the PR1 adversarial pass. authenticated keeps
-- its grant — execs read via authenticated and RLS gates reps out.
revoke all on public.qualification_scores      from anon;
revoke all on public.qualification_enrichment  from anon;
revoke all on public.qualification_reviews     from anon;
revoke all on public.rep_call_grades           from anon;

-- Exec-only tables: single policy; no rep policy ⇒ reps fail closed. ----------
create policy "exec_all" on public.qualification_scores
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'));

create policy "exec_all" on public.qualification_enrichment
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'));

create policy "exec_all" on public.rep_call_grades
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'));

-- qualification_reviews: exec full; rep READ-only for own-prospect rows. -------
create policy "exec_all" on public.qualification_reviews
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'));

create policy "rep_read_own" on public.qualification_reviews
  for select to authenticated
  using (exists (
    select 1 from public.prospects p
    where p.id = qualification_reviews.prospect_id
      and p.assigned_rep_id = (select auth.uid())
  ));

-- prospects: swap the allow-list-all policy (#105/#86) for exec-all + rep-own. -
-- Exec (designation='executive') keeps full access — no regression for the sole
-- current internal user. Reps get only their own leads (NULL assigned_rep_id ⇒
-- none today; intended forward-looking tightening).
drop policy if exists "internal_users_all" on public.prospects;

create policy "exec_all" on public.prospects
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'));

-- Reps are READ-only on their own leads (matches scoping §6 "rep sees own").
-- Deliberately NOT `for all`: a rep DELETE would cascade through the child FKs
-- (on delete cascade) and — because a cascade runs as the table owner, bypassing
-- child-table RLS — silently destroy the exec-only qualification rows (incl. the
-- legal-sensitive qualification_reviews decision record) for that prospect. Rep
-- write-scope, if ever needed, is a deliberate PR3 design, not a side effect.
create policy "rep_read_own" on public.prospects
  for select to authenticated
  using (assigned_rep_id = (select auth.uid()));
