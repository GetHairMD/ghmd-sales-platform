-- National Territory Status Map — decisions #121 / #122 / #132.
--
-- Adds a nullable prospect_id FK on territories and a SECURITY DEFINER read
-- function that projects every territory's status (sold | in_pipeline | available)
-- for the national /national-map surface, WITHOUT exposing any underlying
-- prospects row.
--
-- Why a function, not a view: a view runs with the CALLER's RLS on prospects, so
-- rep_read_own (assigned_rep_id = auth.uid()) would hide every OTHER rep's prospect
-- and the national "in pipeline" derivation would be wrong per-viewer. A SECURITY
-- DEFINER function evaluates status from the privileged owner's perspective and
-- returns ONLY the derived status label (+ sold_to_name for sold) — never a
-- prospect column — so no rep/prospect identity leaks for in_pipeline territories.
--
-- Design assumption (brief §2): introduces NO new RLS surface. territories already
-- has internal_users_all (full read to any internal user); prospects RLS is
-- unchanged. If this ever needs broader prospects access, that assumption broke —
-- stop and re-scope, do not widen RLS here.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New FK. Nullable — most rows (all current test data) will be null = available.
--    Distinct from the retired reserved_for column (decision #132: do NOT repurpose
--    reserved_for; it is flagged for retirement elsewhere).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.territories
  add column prospect_id uuid references public.prospects(id);

create index if not exists territories_prospect_id_idx
  on public.territories(prospect_id);

comment on column public.territories.prospect_id is
  'Optional FK to the prospect a territory is sold to / in pipeline with. Nullable; '
  'null => available. Feeds territory_status_map() status derivation (decision #132). '
  'Distinct from the retired reserved_for column — do not repurpose that one.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. territory_status_map() — national status projection.
--
--    status = 'in_pipeline' fires at prospect stage >= 6 (STAGE.PROPOSAL_SENT).
--    PIN: the literal 6 below MUST equal STAGE.PROPOSAL_SENT in
--    src/lib/pipeline-stages.ts. SQL cannot import the TS constant, so a vitest test
--    (national-status-map.test.ts) pins STAGE.PROPOSAL_SENT === 6 — any change to
--    that constant breaks CI loudly instead of silently desyncing this literal.
--    If you renumber the pipeline stages, change this literal too.
--
--    sold_to_name is populated ONLY when status = 'sold'; null for every other row.
--    No prospect identity is exposed for in_pipeline / available territories.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.territory_status_map()
returns table (
  id uuid,
  name text,
  center_lat numeric,
  center_lng numeric,
  boundary_geojson jsonb,
  status text,        -- 'sold' | 'in_pipeline' | 'available'
  sold_to_name text   -- non-null ONLY when status = 'sold'
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.center_lat,
    t.center_lng,
    t.boundary_geojson,
    case
      when t.status = 'sold' then 'sold'
      when p.stage >= 6 then 'in_pipeline'  -- 6 == STAGE.PROPOSAL_SENT (pipeline-stages.ts; pinned by test)
      else 'available'
    end as status,
    case when t.status = 'sold' then p.full_name else null end as sold_to_name
  from public.territories t
  left join public.prospects p on p.id = t.prospect_id
  where exists (
    select 1 from public.internal_users iu where iu.user_id = auth.uid()
  );
$$;

-- Belt-and-braces grants (house style): strip the default PUBLIC grant, then grant
-- EXECUTE to authenticated only. Never callable by anon.
revoke all on function public.territory_status_map() from public, anon, authenticated;
grant execute on function public.territory_status_map() to authenticated;

comment on function public.territory_status_map() is
  'National territory status projection for /national-map (decision #132). SECURITY '
  'DEFINER with pinned search_path=public: derives sold | in_pipeline | available '
  'across ALL reps'' prospects without exposing any prospects row. Gated on '
  'internal_users membership (any internal user, rep or executive); EXECUTE granted '
  'to authenticated only, never anon. sold_to_name is non-null only for sold rows.';
