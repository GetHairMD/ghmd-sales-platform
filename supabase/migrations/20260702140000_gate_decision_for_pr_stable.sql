-- Second-Opinion Gate — mark gate_decision_for_pr STABLE.
--
-- The function is read-only (a single SELECT with no writes or side effects), so
-- STABLE is its accurate volatility. VOLATILE (the default) is still callable via
-- PostgREST RPC over POST — verified over the anon REST path — but STABLE declares
-- intent correctly, lets PostgREST expose it over GET as well, and helps the
-- planner. Grants and body are preserved by ALTER.
-- Follow-up to 20260702130000_gate_decision_for_pr_repo_scope.sql.
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).

alter function public.gate_decision_for_pr(text, integer) stable;
