-- Decision Log — add residual_risk tracking columns.
-- Distinguishes "fully resolved" from "accepted with known residual risk" on each
-- decision_log entry. Read literally by the Second-Opinion Gate comparison logic;
-- never inferred from the reasoning text field.
-- residual_risk is a separate dimension from legal_flag — the two can co-occur.
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- RLS already enabled on ops.decision_log (see 20260628035800_ops_decision_log.sql);
-- adding columns does not change that.

alter table ops.decision_log
  add column residual_risk text default 'none'
    check (residual_risk = any (array['none'::text, 'accepted'::text, 'unresolved'::text])),
  add column residual_risk_owner text,
  add column residual_risk_target_date date;
