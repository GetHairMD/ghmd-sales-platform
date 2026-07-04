-- ─────────────────────────────────────────────────────────────────────────────
-- M0.5 — Designation comments (crm-demo-v1 P0.5)
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP never touched.
-- Applied to prod via MCP as version 20260704050531 (2026-07-04). Non-destructive
-- metadata only — no column/table structure change, RLS unchanged.
--
-- (1) Deprecates deals.stage: pipeline position lives on prospects.stage
--     (pipeline-stages.ts). deals is the Territory Agreement record (PRD §2.4).
--     No code reads/writes deals.stage from this point; a future cleanup migration
--     drops the column once the M-suite lands.
-- (2) Designates call_scores as the Salesperson Scorecard — seller-side of the
--     bilateral scoring model, distinct from buyer/operator scoring (PRD §3.2, §5).
-- ─────────────────────────────────────────────────────────────────────────────

comment on column public.deals.stage is
  'DEPRECATED (crm-demo-v1, decision #53 / PRD §2.4). Do not read or write this column. Pipeline position is prospects.stage (source of truth: src/lib/pipeline-stages.ts); deals is the Territory Agreement record. Dropped by a future cleanup migration once the M-suite lands.';

comment on table public.call_scores is
  'Salesperson Scorecard (crm-demo-v1, decision #53 / PRD §3.2, §5): seller-side self-coaching view of the rep''s own call performance. Distinct from BUYER/operator scoring in operator_scores / operator_score_records / operator_enrichment.';
