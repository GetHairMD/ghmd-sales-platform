-- Second-Opinion Gate — standing-decision flag for the overdue sweep.
-- Some accepted residual-risk rows are intentionally undated standing decisions
-- (e.g. the OpenAI egress boundary and the GitHub-Mobile-only escalation channel),
-- not tasks with deadlines. Mark them residual_risk_standing = true so the weekly
-- sweep does not flag them as overdue, while still catching rows that are undated
-- by oversight (standing = false).
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).

alter table ops.decision_log
  add column residual_risk_standing boolean not null default false;

-- Re-create the sweep helper to exclude standing decisions. Return shape unchanged.
create or replace function public.residual_risk_overdue()
returns table (
  id                        bigint,
  title                     text,
  residual_risk_owner       text,
  residual_risk_target_date date,
  decided_on                date,
  days_overdue              integer,
  reason                    text
)
language sql
security definer
set search_path = ops, public
as $$
  select
    d.id,
    d.title,
    d.residual_risk_owner,
    d.residual_risk_target_date,
    d.decided_on,
    case
      when d.residual_risk_target_date is not null
        then (current_date - d.residual_risk_target_date)
      else null
    end as days_overdue,
    case
      when d.residual_risk_target_date is null then 'no_target_date'
      else 'overdue'
    end as reason
  from ops.decision_log d
  where d.residual_risk = 'accepted'
    and d.residual_risk_standing = false
    and d.status not in ('SUPERSEDED', 'REJECTED')
    and (
      d.residual_risk_target_date is null
      or d.residual_risk_target_date < current_date
    )
  order by d.residual_risk_target_date asc nulls last, d.id asc;
$$;

revoke all on function public.residual_risk_overdue() from public, anon, authenticated;
grant execute on function public.residual_risk_overdue() to service_role;
