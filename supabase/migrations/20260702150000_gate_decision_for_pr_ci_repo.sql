-- Second-Opinion Gate — make the repo match case-insensitive.
--
-- Follow-up to 20260702130000 / 20260702140000, closing a gap the gate's own
-- GPT-5 review flagged on PR #44: GitHub owner/repo names are case-insensitive,
-- but related_repo = p_repo is a case-sensitive text equality. A casing mismatch
-- between the stored related_repo and the Actions-provided GITHUB_REPOSITORY would
-- return "no row", which verifyDeclaration treats as a pass when the PR body says
-- none — letting a bound non-none residual_risk silently evade the fail-closed
-- check. Normalizing both sides with lower() removes that false-negative, and the
-- uniqueness index is switched to lower(related_repo) so at most one row can bind
-- a given (case-insensitive repo, PR).
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).

drop index if exists ops.decision_log_related_repo_pr_uniq;
create unique index if not exists decision_log_related_repo_pr_uniq
  on ops.decision_log (lower(related_repo), related_pr)
  where related_pr is not null;

create or replace function public.gate_decision_for_pr(p_repo text, p_pr_number integer)
returns table (
  id            bigint,
  residual_risk text,
  status        text
)
language sql
stable
security definer
set search_path = ops, public
as $$
  select d.id, d.residual_risk, d.status
  from ops.decision_log d
  where lower(d.related_repo) = lower(p_repo)
    and d.related_pr = p_pr_number;
$$;

revoke all on function public.gate_decision_for_pr(text, integer) from public, anon, authenticated;
grant execute on function public.gate_decision_for_pr(text, integer) to anon;
