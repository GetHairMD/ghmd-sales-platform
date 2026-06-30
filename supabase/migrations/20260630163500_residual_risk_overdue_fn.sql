-- Second-Opinion Gate — overdue residual-risk sweep helper (A5 / Step 6).
-- SECURITY DEFINER read function returning a SAFE projection of accepted-risk
-- decision_log rows that are overdue or have no target date. Deliberately omits
-- the legal-sensitive `reasoning` and `decision` columns so the scheduled CI
-- sweep never reads them. Execute granted to service_role only.
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).

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
    and d.status not in ('SUPERSEDED', 'REJECTED')
    and (
      d.residual_risk_target_date is null
      or d.residual_risk_target_date < current_date
    )
  order by d.residual_risk_target_date asc nulls last, d.id asc;
$$;

revoke all on function public.residual_risk_overdue() from public, anon, authenticated;
grant execute on function public.residual_risk_overdue() to service_role;
