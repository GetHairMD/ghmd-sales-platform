-- v3 Drive-Time Sizing — async job model + block-group (GEOID) census cache
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Backs the async rework of POST /api/territories/size (was a synchronous route that
-- 504'd on dense metros). Two additive tables, no changes to existing tables/RLS:
--
--   • territory_sizing_jobs      — one row per sizing request. POST enqueues (status
--                                  'queued') and returns 202 { jobId }; the compute runs
--                                  out-of-band (Netlify Background Function) and writes the
--                                  full result payload back. A poll route reads by id.
--                                  NON-WRITE BOUNDARY: the job stores its computed payload
--                                  in `result` ONLY. It NEVER writes territories.boundary_*
--                                  / sold_boundary_geom — promoting a job result into a
--                                  territories row is a separate, later-authorized action.
--
--   • census_block_group_cache   — GEOID-keyed cache of the per-block-group census data
--                                  (ACS B19001 histogram + dasymetric block weights) that
--                                  the sizing engine re-fetches identically across every
--                                  candidate drive-time within one run AND across runs in
--                                  the same metro. Realizes CLAUDE.md Rule 5 (Census cached
--                                  90 days) at the BLOCK-GROUP grain rather than the
--                                  territory grain, so it also serves ad-hoc (no-territoryId)
--                                  sizing calls — which a territories.census_raw_data cache
--                                  cannot. Freshness window = CENSUS_CACHE_TTL_DAYS (90).
--
-- RLS: enabled from creation on BOTH tables, SERVICE-ROLE-ONLY (no anon/authenticated
-- policy — deny-by-default; service_role bypasses RLS). Matches the accepted
-- operator/proposal-tables posture (decision #58): all reads/writes go through
-- server-side service-role code (the route, the background worker); the browser never
-- queries these tables directly.

-- ─────────────────────────────────────────────────────────────────────────────
-- territory_sizing_jobs — async sizing job rows.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.territory_sizing_jobs (
  id uuid primary key default gen_random_uuid(),

  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),

  -- Input: an ad-hoc practice center OR a territory to resolve the center from.
  -- At least one shape must be present (enforced by the check below). A territoryId
  -- job still resolves + sold-clips exactly like the old sync route; it just never
  -- writes anything back to that territories row (non-write boundary above).
  input_center_lat  numeric(10, 7),
  input_center_lng  numeric(10, 7),
  input_territory_id uuid references public.territories(id) on delete set null,

  -- Auth user id (from the enqueueing request) for audit; nullable for script/system runs.
  requested_by uuid,

  -- Full SizeTerritoryOutcome payload on success (result + sizedContour + provenance).
  result jsonb,
  -- Structured failure detail on 'failed': { message, detail?, name? }.
  error jsonb,
  -- Per-leg timing observability: { totalMs, isochroneMs, censusMs, cacheHits, cacheMisses, ... }.
  timing jsonb,

  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz,
  updated_at  timestamptz not null default now(),

  constraint territory_sizing_jobs_has_input check (
    (input_center_lat is not null and input_center_lng is not null)
    or input_territory_id is not null
  )
);

comment on table public.territory_sizing_jobs is
  'Async v3 drive-time sizing jobs. POST /api/territories/size enqueues (queued) + returns 202 {jobId}; a Netlify Background Function computes out-of-band and writes result/error/timing; a poll route reads by id. Service-role-only (RLS enabled, no anon/authenticated policy). NON-WRITE BOUNDARY: result is stored here only; the job never writes territories.boundary_* / sold_boundary_geom.';
comment on column public.territory_sizing_jobs.status is
  'queued → running → (succeeded | failed). Set by the worker; the client polls it.';
comment on column public.territory_sizing_jobs.result is
  'Full SizeTerritoryOutcome on success: { result: V3SizingResult, sizedContour, provenance }. Inspectable payload only — not promoted into any territories row this phase.';
comment on column public.territory_sizing_jobs.timing is
  'Per-leg timing for observability (cold vs warm cache): { totalMs, isochroneMs, censusMs, cacheHits, cacheMisses, blockGroups, ... }.';

create index if not exists territory_sizing_jobs_status_idx
  on public.territory_sizing_jobs (status);
create index if not exists territory_sizing_jobs_created_at_idx
  on public.territory_sizing_jobs (created_at desc);
create index if not exists territory_sizing_jobs_territory_id_idx
  on public.territory_sizing_jobs (input_territory_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- census_block_group_cache — GEOID-keyed census data cache (Rule 5, block-group grain).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.census_block_group_cache (
  -- 12-digit block-group GEOID (state+county+tract+bg). The natural, call-shape-agnostic
  -- cache key: a block group is a strict subset of every candidate isochrone that
  -- contains it, so the same GEOID is reused across minutes within a run and across runs.
  geoid text primary key check (geoid ~ '^[0-9]{12}$'),

  -- 2-digit state FIPS (drives the credit-share state blend).
  state_fips text not null check (state_fips ~ '^[0-9]{2}$'),

  -- Representative interior point of the block group [lng, lat] — cheap coarse pre-clip.
  centroid_lng double precision,
  centroid_lat double precision,

  -- ACS B19001 variable → household count for the whole block group.
  b19001 jsonb not null,
  -- Constituent census blocks (dasymetric weight units): [{ households, point: [lng,lat] }].
  blocks jsonb not null,

  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.census_block_group_cache is
  'GEOID-keyed cache of per-block-group census data (ACS B19001 histogram + dasymetric block weights) for the v3 drive-time sizing engine. Realizes CLAUDE.md Rule 5 (Census cached 90 days) at the block-group grain so it serves both territoryId and ad-hoc sizing calls. Service-role-only (RLS enabled, no anon/authenticated policy). Rows older than CENSUS_CACHE_TTL_DAYS (90) are treated as stale and re-fetched.';
comment on column public.census_block_group_cache.blocks is
  'Dasymetric weight units: [{ households:int, point:[lng,lat] }]. Point-in-polygon of these against a candidate isochrone yields the household-weighted inside fraction.';
comment on column public.census_block_group_cache.fetched_at is
  'When this block group was last fetched from Census/TIGERweb. Staleness = now() - fetched_at > 90 days.';

create index if not exists census_block_group_cache_fetched_at_idx
  on public.census_block_group_cache (fetched_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: enabled, service-role-only. No anon/authenticated policies by design
-- (deny-by-default; service_role bypasses RLS). See header for rationale.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.territory_sizing_jobs      enable row level security;
alter table public.census_block_group_cache   enable row level security;
