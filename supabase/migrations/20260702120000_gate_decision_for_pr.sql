-- Second-Opinion Gate — declaration-integrity lookup (closes decision_log row #24).
--
-- Row #24 accepted that nothing verified the PR-body `coder_residual_risk`
-- declaration against the real ops.decision_log row: CI read the value from the
-- PR description only, never from the table. This migration closes that gap with
-- a NARROW SECURITY DEFINER lookup scoped to a single row — no broad CI table
-- access is re-introduced.
--
-- Mapping: a decision row is bound to the PR that implements it via the new
-- nullable `related_pr` column, written only through the two sanctioned paths
-- (Coder service key / Trace-directed MCP — see decision id 27), never by CI.
-- Keying the lookup on PR number (server-truth) rather than on a PR-body value
-- means a PR author cannot redirect the check to a different row.
--
-- The function returns ONLY (id, residual_risk, status) — never reasoning,
-- decision, title, or legal_flag. search_path is pinned; EXECUTE is granted only
-- to `anon` (the role CI authenticates as via the publishable/anon key). No
-- table-level grants are added: RLS on ops.decision_log stays service_role-only,
-- so the CI role provably cannot read the table directly.
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).

alter table ops.decision_log
  add column if not exists related_pr integer;

comment on column ops.decision_log.related_pr is
  'GitHub PR number that implements this decision. Written only via the two '
  'sanctioned write paths (Coder service key / Trace-directed MCP), never by CI. '
  'Read by public.gate_decision_for_pr() so the Second-Opinion Gate can verify the '
  'PR-body residual_risk declaration against this row. Linkage metadata, not '
  'decision content — may be updated post-insert (see decision row #24 successor).';

-- At most one decision row may be bound to a given PR — the lookup must resolve
-- to a single row. Partial: the many rows with no related_pr are unconstrained.
-- A genuine attempt to bind two decisions to one PR fails loudly at insert time
-- rather than silently letting the function pick one.
create unique index if not exists decision_log_related_pr_uniq
  on ops.decision_log (related_pr)
  where related_pr is not null;

-- Narrow SECURITY DEFINER lookup. Returns the minimal projection of the single
-- row bound to p_pr_number, or zero rows when none is bound. The partial unique
-- index above guarantees at most one row.
create or replace function public.gate_decision_for_pr(p_pr_number integer)
returns table (
  id            bigint,
  residual_risk text,
  status        text
)
language sql
security definer
set search_path = ops, public
as $$
  select d.id, d.residual_risk, d.status
  from ops.decision_log d
  where d.related_pr = p_pr_number;
$$;

comment on function public.gate_decision_for_pr(integer) is
  'Second-Opinion Gate declaration-integrity lookup. Returns the minimal '
  'projection (id, residual_risk, status) of the single ops.decision_log row '
  'bound to the given PR number via related_pr, or zero rows if none is bound. '
  'Deliberately omits reasoning, decision, title, and legal_flag. SECURITY '
  'DEFINER with pinned search_path; EXECUTE granted to anon only. Callable by '
  'anyone holding the public anon/publishable key — accepted, as the returned '
  'metadata is low-sensitivity and already appears in the PR body. Closes '
  'decision_log row #24 (Coder-side residual_risk integrity gap).';

revoke all on function public.gate_decision_for_pr(integer) from public, anon, authenticated;
grant execute on function public.gate_decision_for_pr(integer) to anon;
