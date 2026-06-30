-- Decision Log — export helper for the git mirror.
-- The ops schema is intentionally NOT exposed to PostgREST, so supabase-js
-- cannot read ops.decision_log directly (it errors "Invalid schema: ops").
-- This SECURITY DEFINER function in public lets the export tooling
-- (scripts/export-decision-log.ts) read the full log via .rpc() without
-- exposing the ops schema to the API surface. Execute is service-role only;
-- the service role can read decision_log under RLS anyway, so this adds no
-- new exposure. Returns newest-first (decided_on desc, id desc).
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).

create or replace function public.decision_log_export()
returns table (
  id             bigint,
  decided_on     date,
  platform       text,
  title          text,
  decision       text,
  reasoning      text,
  status         text,
  legal_flag     boolean,
  superseded_by  bigint,
  source_session text
)
language sql
security definer
set search_path = ops, public
as $$
  select
    d.id, d.decided_on, d.platform, d.title, d.decision, d.reasoning,
    d.status, d.legal_flag, d.superseded_by, d.source_session
  from ops.decision_log d
  order by d.decided_on desc, d.id desc;
$$;

revoke all on function public.decision_log_export() from public, anon, authenticated;
grant execute on function public.decision_log_export() to service_role;
