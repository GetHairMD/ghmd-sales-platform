-- Pipeline v2 — deal-health status + soft funding pre-qual gate.
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl). Confirm isolation before apply.
--
-- ALTER TABLE ONLY. The base prospects/deals/territories DDL is NOT tracked in repo
-- migrations (schema drift — created out-of-band, see PR description "deferred items").
-- Do NOT recreate base tables here. RLS is already enabled on public.prospects; adding
-- columns does not change that. DB is empty (0 rows) so no backfill is required — the
-- NOT NULL defaults cover any future insert.
--
-- Stage = pipeline position (prospects.stage). deal_status = orthogonal health: a deal can
-- be stage 10 (Funded / Won) and still 'stalled'. Funding columns back the SOFT gate at
-- stage 8 (Contract Sent): advancing without cleared pre-qual is allowed but flagged.

alter table public.prospects
  -- Deal health, independent of stage position.
  add column deal_status text not null default 'active'
    check (deal_status = any (array['active'::text, 'stalled'::text, 'lost'::text])),

  -- Soft funding pre-qual gate (stage 7 clears it; stage 8+ checks it).
  -- Manual for now: the lender (iLease/Ottri) notifies GHMD directly and corporate marks it.
  -- cleared_at / cleared_by exist so a future lender webhook can populate them automatically.
  add column funding_prequal_cleared boolean not null default false,
  add column funding_prequal_cleared_at timestamptz,
  add column funding_prequal_cleared_by text,

  -- Set true when a record is advanced to stage >= 8 without funding_prequal_cleared.
  -- Drives the amber "PRE-QUAL SKIPPED" badge on the Kanban card and detail page.
  add column skipped_funding_prequal boolean not null default false;

comment on column public.prospects.deal_status is
  'Deal health, orthogonal to stage: active | stalled | lost.';
comment on column public.prospects.funding_prequal_cleared is
  'Lender pre-qual confirmed to GHMD. Soft gate at stage 8 (Contract Sent).';
comment on column public.prospects.skipped_funding_prequal is
  'Advanced to stage >= 8 without cleared pre-qual. Drives PRE-QUAL SKIPPED badge.';
