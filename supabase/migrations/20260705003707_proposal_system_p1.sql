-- ─────────────────────────────────────────────────────────────────────────────
-- Proposal System P1 — data model for the gated /p/[slug] proposal route
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Session B (ops.decision_log id 66; Section-4 methodology id 68). Replaces the
-- hand-cloned-Netlify-per-prospect model with one data-driven page rendered from
-- Supabase. This migration adds three tables:
--   • proposals          — 1:1 to prospects; the rendered proposal's stored state
--   • proposal_sessions   — one row per successful access-code gate pass
--   • proposal_events     — narrow event log (session_start / section_view /
--                            calculator_interaction) for sections 1–5 analytics
--
-- RLS: enabled from creation on all three, SERVICE-ROLE-ONLY (no anon/authenticated
-- policy — deny-by-default). This is the tightest posture and matches the accepted
-- operator-tables pattern (decision #58). It deliberately does NOT add an 8th
-- always-true (USING (true)) policy. All reads (public render) and writes (gate
-- pass, events, seed) go through server-side service-role code only; the browser
-- never queries these tables directly, so no pre-auth data can leak.
-- ─────────────────────────────────────────────────────────────────────────────

-- PROPOSALS — 1:1 with prospects. Snapshot of the rendered proposal's state.
-- All numeric territory/scenario values are computed from formula-v2
-- (/lib/addressable-market-constants.ts) at generation/seed time and STORED here;
-- never computed client-side, never hand-entered (Rule 6 / brief §3).
create table proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 1:1 link. ON DELETE CASCADE so the idempotent demo seed (which deletes
  -- prospects WHERE lead_source = 'demo_seed') cleans up proposals too.
  prospect_id uuid not null unique references prospects(id) on delete cascade,

  -- Gate. Access code is hashed at rest (SHA-256 + per-row salt); never stored plain.
  slug text not null unique,
  access_code_hash text not null,
  access_code_salt text not null,

  -- Template snapshot fields (sections 1–5 only; §6–19 fields are Session C).
  prospect_name_full text,
  practice_name text,
  practice_logo_url text,
  specialty text,
  territory_name text,
  prospect_photo_url text,
  territory_polygon jsonb,
  territory_pin_lat numeric(10,7),
  territory_pin_lng numeric(10,7),
  prepared_month text,

  -- Formula-v2 outputs (computed at generation/seed time, stored).
  addressable_market_total integer,
  addressable_market_male_pct numeric(5,2),
  addressable_market_female_pct numeric(5,2),
  -- Age × sex demographic composition from ACS B01001 (decision #68). This is
  -- territory demographic context, analytically SEPARATE from the affordability
  -- addressable figures — not a demand/qualification/propensity weighting.
  demand_matrix jsonb,
  new_patients_range_low integer,
  new_patients_range_high integer,

  -- Practice Opportunity scenario (sample well + calculator seed base).
  scenario_inputs jsonb,
  scenario_outputs jsonb
);

comment on table proposals is
  'Session B: 1:1 rendered-proposal state for /p/[slug]. Service-role-only (RLS enabled, no anon/authenticated policy). Numeric fields are stored formula-v2 outputs, never client-computed. demand_matrix is ACS B01001 age/sex demographics (decision #68), separate from addressable figures.';
comment on column proposals.demand_matrix is
  'ACS B01001 age-band x sex population counts for the territory (territory demographic composition; NOT demand-weighted/qualified). Source + vintage carried in the JSON.';

create index proposals_prospect_id_idx on proposals (prospect_id);

-- PROPOSAL_SESSIONS — one row per successful gate pass.
create table proposal_sessions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  started_at timestamptz not null default now(),
  device text,
  referrer text,
  -- Correlates subsequent proposal_events for this visit (set by the gate handler).
  session_cookie_id text
);

comment on table proposal_sessions is
  'Session B: one row per successful access-code gate pass on /p/[slug]. Service-role-only (RLS enabled, no anon/authenticated policy).';

create index proposal_sessions_prospect_id_idx on proposal_sessions (prospect_id);

-- PROPOSAL_EVENTS — narrow event log for sections 1–5 (full taxonomy is Session C).
create table proposal_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  session_cookie_id text,
  event_type text not null
    check (event_type in ('session_start', 'section_view', 'calculator_interaction')),
  payload jsonb,
  created_at timestamptz not null default now()
);

comment on table proposal_events is
  'Session B: narrow first-party event log for /p/[slug] sections 1–5 (session_start / section_view / calculator_interaction only). Service-role-only (RLS enabled, no anon/authenticated policy). Full event taxonomy is Session C.';

create index proposal_events_prospect_id_idx on proposal_events (prospect_id);
create index proposal_events_session_cookie_id_idx on proposal_events (session_cookie_id);

-- RLS: enabled, service-role-only. No anon/authenticated policies by design
-- (deny-by-default; service_role bypasses RLS). See header for rationale.
alter table proposals enable row level security;
alter table proposal_sessions enable row level security;
alter table proposal_events enable row level security;
