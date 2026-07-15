-- ─────────────────────────────────────────────────────────────────────────────
-- E-3 — Resource Library: resource_engagement_events + open-logging function.
-- Decision #159 (Session E sequence). Spec: docs/SALES-OS-SPEC.md §4C.3.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Depends on 20260714250000 (resource_shares).
--
-- WHAT this migration does:
--   1. resource_engagement_events — a narrow first-party event log, service-role-only,
--      mirroring proposal_events EXACTLY (RLS enabled, ZERO policies, no anon/
--      authenticated grants; service_role bypasses RLS). event_type starts as
--      `link_opened` only and widens later (Wistia play / download tracking are
--      explicitly out of scope for E-3).
--   2. open_resource_share(token) — a SECURITY DEFINER function that the /r/[token]
--      prospect-facing route calls once per visit. It atomically: validates the token
--      against an ACTIVE asset with a redirect target, logs exactly one link_opened
--      event, and stamps the share's open-tracking columns. It returns ONLY the
--      redirect URL (or NULL) — zero internal metadata leaves the function.
--
-- Both `supabase db push` and MCP apply_migration wrap each migration in a
-- transaction automatically — no explicit begin/commit needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Event log — service-role-only, mirrors proposal_events ────────────────
create table if not exists public.resource_engagement_events (
  id         uuid primary key default gen_random_uuid(),
  share_id   uuid not null references public.resource_shares(id) on delete cascade,
  event_type text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.resource_engagement_events'::regclass
      and conname  = 'resource_engagement_events_event_type_check'
  ) then
    alter table public.resource_engagement_events
      add constraint resource_engagement_events_event_type_check
      check (event_type in ('link_opened'));
  end if;
end $$;

create index if not exists resource_engagement_events_share_id_idx
  on public.resource_engagement_events (share_id);
create index if not exists resource_engagement_events_created_at_idx
  on public.resource_engagement_events (created_at);

-- RLS: enabled, service-role-only. NO anon/authenticated policies and NO grants, by
-- design (deny-by-default; service_role bypasses RLS) — identical to proposal_events.
alter table public.resource_engagement_events enable row level security;
revoke all on public.resource_engagement_events from anon, authenticated;

comment on table public.resource_engagement_events is
  'Narrow first-party event log for Resource Library tracked links (E-3, §4C.3). '
  'event_type is link_opened only this session (widen later; Wistia play/download are '
  'out of scope). Service-role-only: RLS enabled with NO anon/authenticated policy '
  '(deny-by-default; service_role bypasses RLS) — mirrors proposal_events. Written only '
  'by open_resource_share().';

-- ── 2. open_resource_share(token) — the /r/[token] atomic open path ──────────
-- SECURITY DEFINER ON PURPOSE, and it is the mirror image of the community-board
-- stamp trigger's INVOKER choice: the prospect who opens /r/<token> is UNAUTHENTICATED
-- (no auth.uid()), so the privileged writes to the service-role-only event log and the
-- no-client-UPDATE tracking columns must run as the definer, not the caller.
--
-- Returns the redirect URL, or NULL when the token is unknown / the asset is inactive /
-- there is no redirect target. On NULL the route renders a graceful not-found and no
-- event is logged (nothing was actually opened). Crucially, the function returns ONLY
-- the URL — never the rep name, prospect name, approval status, or any other internal
-- field (AC6/AC7: zero internal-metadata leakage).
create or replace function public.open_resource_share(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share_id uuid;
  v_url      text;
begin
  select s.id, a.external_url
    into v_share_id, v_url
  from public.resource_shares s
  join public.resource_assets a on a.id = s.asset_id
  where s.token = p_token
    and a.active = true
    and a.external_url is not null;

  if v_share_id is null then
    return null;  -- unknown token / inactive asset / no target → caller 404s, no leak
  end if;

  insert into public.resource_engagement_events (share_id, event_type, payload)
  values (v_share_id, 'link_opened', jsonb_build_object('opened_at', now()));

  update public.resource_shares
     set open_count      = open_count + 1,
         last_opened_at  = now(),
         first_opened_at = coalesce(first_opened_at, now())
   where id = v_share_id;

  return v_url;
end;
$$;

comment on function public.open_resource_share(text) is
  'Prospect-facing atomic open path for /r/<token> (E-3). Validates the token against an '
  'ACTIVE asset with a redirect target, logs exactly one link_opened event, stamps the '
  'share''s open-tracking columns (open_count += 1, last_opened_at, first_opened_at on '
  'first open), and returns ONLY the redirect URL — no internal metadata. SECURITY '
  'DEFINER because the caller is an unauthenticated prospect with no auth.uid(); the '
  'privileged writes to the service-role-only event log and the no-client-UPDATE tracking '
  'columns must run as the definer. Returns NULL for unknown/inactive/target-less tokens, '
  'logging nothing.';

-- Same explicit-grant discipline as every other trigger/helper function in this repo:
-- a function inherits the default PUBLIC EXECUTE grant, which PostgREST would expose as a
-- callable RPC. Revoke ALL, then grant EXECUTE to service_role ONLY — the /r/[token]
-- route calls this through the service-role client. anon/authenticated cannot call it.
revoke all on function public.open_resource_share(text) from public, anon, authenticated;
grant execute on function public.open_resource_share(text) to service_role;
