-- Second-Opinion Gate — scope the PR binding to (repo, pr_number).
--
-- Follow-up to 20260702120000_gate_decision_for_pr.sql, hardening a gap the
-- gate's own GPT-5 review flagged on PR #44: GitHub PR numbers are per-repo, and
-- ops.decision_log.platform explicitly permits 'nip'/'cross' rows, so keying the
-- binding on related_pr alone could let a same-numbered PR from another repo
-- collide or resolve to the wrong row. Scoping the key to (related_repo,
-- related_pr) removes that cross-repo ambiguity and reinforces NIP separation.
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).

alter table ops.decision_log
  add column if not exists related_repo text;

comment on column ops.decision_log.related_repo is
  'GitHub "owner/repo" that owns related_pr (PR numbers are per-repo). Written '
  'only via the two sanctioned paths, never by CI. Paired with related_pr — see '
  'the both-or-neither check constraint.';

-- related_pr and related_repo are set together or not at all. This also makes
-- the composite unique index below enforce true per-(repo, pr) uniqueness
-- (related_repo is never null when related_pr is present).
alter table ops.decision_log
  drop constraint if exists decision_log_related_pr_repo_together;
alter table ops.decision_log
  add constraint decision_log_related_pr_repo_together
  check ((related_pr is null) = (related_repo is null));

-- Replace the pr-only unique index with a (repo, pr) composite.
drop index if exists ops.decision_log_related_pr_uniq;
create unique index if not exists decision_log_related_repo_pr_uniq
  on ops.decision_log (related_repo, related_pr)
  where related_pr is not null;

-- Replace the pr-only lookup with a repo-scoped one. The old 1-arg function is
-- dropped so no unscoped path lingers.
drop function if exists public.gate_decision_for_pr(integer);

create or replace function public.gate_decision_for_pr(p_repo text, p_pr_number integer)
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
  where d.related_repo = p_repo
    and d.related_pr = p_pr_number;
$$;

comment on function public.gate_decision_for_pr(text, integer) is
  'Second-Opinion Gate declaration-integrity lookup, scoped to (repo, pr). '
  'Returns the minimal projection (id, residual_risk, status) of the single '
  'ops.decision_log row bound to the given owner/repo + PR number, or zero rows '
  'if none is bound. Omits reasoning/decision/title/legal_flag. SECURITY DEFINER '
  'with pinned search_path; EXECUTE granted to anon only; no table-level grants '
  '(RLS on ops.decision_log stays service_role-only). Closes decision_log #24.';

revoke all on function public.gate_decision_for_pr(text, integer) from public, anon, authenticated;
grant execute on function public.gate_decision_for_pr(text, integer) to anon;
