-- ─────────────────────────────────────────────────────────────────────────────
-- QA anchor territory isolation — protect the decision #94 v3 sizing baselines
-- from demo-seed churn, and restore the provenance link the PR2 reseed severed.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP never touched.
--
-- BACKGROUND: seed-demo.ts named its churnable demo territories identically to the
-- #94 QA anchors (Austin – Westlake / Dallas – Preston Hollow / Nashville – Green
-- Hills) and tagged them '[demo_seed]', so the anchor territories and demo
-- fixtures were the SAME rows. A reseed deleted + recreated them (new UUIDs),
-- orphaning the 6 succeeded territory_sizing_jobs that are #94's locked baseline
-- (their input_territory_id → NULL via the ON DELETE SET NULL FK). The jobs'
-- `result` payloads (the locked figures) were never touched.
--
-- THIS MIGRATION makes the anchors STRUCTURALLY unreachable by demo churn:
--   1. territories.qa_locked flag — the rewritten seed never deletes a qa_locked row.
--   2. Promote the 3 current anchor territories to qa_locked, off the '[demo_seed]'
--      tag, so no seed delete keyed on that tag can reach them.
--   3. Re-point the 6 succeeded anchor jobs back to their anchor territory by exact
--      center match. The 3 stale 'queued' jobs (no result) are left as-is — their
--      input_center already satisfies territory_sizing_jobs_has_input.
--
-- Additive column + corrective data re-point ONLY. No ON DELETE / FK / RLS change,
-- so this stays 'review' tier per the brief's escalation criteria. Idempotent and
-- safe on a fresh DB (all UPDATEs match 0 rows where the data isn't present).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.territories
  add column if not exists qa_locked boolean not null default false;

comment on column public.territories.qa_locked is
  'When true, this territory is a protected QA/reference fixture (e.g. a decision #94 v3 sizing anchor) and must never be deleted or recreated by any demo/seed lifecycle. seed-demo.ts excludes qa_locked rows from all delete/churn by construction.';

-- 2. Promote the 3 current anchor territories to protected fixtures.
update public.territories
set qa_locked = true,
    notes     = '[qa_anchor]'
where notes = '[demo_seed]'
  and name in ('Austin – Westlake', 'Dallas – Preston Hollow', 'Nashville – Green Hills');

-- 3. Restore provenance: re-point the 6 succeeded #94 anchor jobs to their protected
-- territory by exact center match. Touches only orphaned (NULL) succeeded jobs and
-- never modifies `result`.
update public.territory_sizing_jobs j
set input_territory_id = t.id
from public.territories t
where t.qa_locked
  and j.status = 'succeeded'
  and j.input_territory_id is null
  and j.input_center_lat = t.center_lat
  and j.input_center_lng = t.center_lng;
