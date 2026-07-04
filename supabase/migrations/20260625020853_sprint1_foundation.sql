-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 1 foundation — BASELINE CAPTURE (M0, crm-demo-v1 P0.5)
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- WHAT: the base DDL for prospects, territories, deals, call_scores,
-- spoke_candidates, outreach_touches + their RLS. This was applied to production
-- out-of-band as migration version 20260625020853 ("20260624_sprint1_foundation",
-- applied 2026-06-25) but the migration FILE was never committed — the schema
-- drift flagged in 20260703120000's header ("base ... DDL is NOT tracked in repo
-- migrations") and in decision #53's residual risk.
--
-- SOURCE: recovered VERBATIM from supabase_migrations.schema_migrations on
-- project cprltmwwldbxcsunsafl (2026-07-04). Nothing below is edited.
--
-- ALREADY APPLIED — DO NOT RE-APPLY to the existing project: version
-- 20260625020853 is present in schema_migrations, so `db push` skips it. This
-- file is REPO RECONCILIATION only. It carries the original (earliest) version
-- so fresh branch databases replay it FIRST and every later ALTER (sprint3
-- census columns, pipeline_v2 deal-health/funding) lands on tables that exist —
-- repo-only reconstruction now works.
--
-- FIDELITY (verified 2026-07-04): current prod = this baseline + tracked ALTERs.
-- deals — unchanged from below. prospects — below + pipeline_v2 columns
-- (deal_status, funding_prequal_*, skipped_funding_prequal). territories —
-- below + census columns (census_raw_data, census_fetched_at). No dashboard drift.
-- ─────────────────────────────────────────────────────────────────────────────

-- PROSPECTS
create table prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  full_name text not null,
  email text,
  phone text,
  practice_name text,
  website text,
  specialty text,
  lead_source text not null,
  lead_source_sub text,
  assigned_rep text not null default 'leif',
  strong_connection boolean default false,
  referrer_id uuid references prospects(id),
  icp_score integer,
  stage integer not null default 1,
  stage_updated_at timestamptz default now(),
  notes text,
  archived boolean default false
);

-- TERRITORIES (must exist before deals)
create table territories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  name text not null,
  center_lat numeric(10,7) not null,
  center_lng numeric(10,7) not null,
  drive_time_minutes integer not null default 30,
  outer_ring_minutes integer not null default 45,
  addressable_patients_primary integer,
  addressable_patients_outer integer,
  formula_run_at timestamptz,
  formula_inputs jsonb,
  status text default 'available',
  reserved_for uuid references prospects(id),
  notes text
);

-- DEALS
create table deals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  prospect_id uuid not null references prospects(id),
  territory_id uuid references territories(id),
  go_no_go text,
  go_decision_at timestamptz,
  go_decision_by text,
  proposal_sent_at timestamptz,
  proposal_url text,
  box_sign_envelope_id text,
  signed_at timestamptz,
  territory_price numeric(10,2) default 179000.00,
  stage integer not null default 1,
  notes text
);

-- CALL_SCORES
create table call_scores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  prospect_id uuid not null references prospects(id),
  deal_id uuid references deals(id),
  scored_by text not null,
  call_date date not null,
  total_score integer not null check (total_score between 0 and 100),
  scorecard_data jsonb,
  notes text
);

-- SPOKE_CANDIDATES
create table spoke_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  territory_id uuid references territories(id),
  practice_name text,
  address text,
  lat numeric(10,7),
  lng numeric(10,7),
  npi text,
  specialty text,
  places_id text,
  tier integer,
  review_status text default 'pending',
  reviewed_by text,
  notes text
);

-- OUTREACH_TOUCHES
create table outreach_touches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  prospect_id uuid not null references prospects(id),
  touch_type text not null,
  touch_date timestamptz not null default now(),
  owner text not null,
  subject text,
  body text,
  outcome text,
  trip_wire_fired boolean default false,
  notes text
);

-- RLS: enable on all tables
alter table prospects enable row level security;
alter table deals enable row level security;
alter table territories enable row level security;
alter table call_scores enable row level security;
alter table spoke_candidates enable row level security;
alter table outreach_touches enable row level security;

-- RLS: Sprint 1 permissive policies (tighten Sprint 2)
create policy "authenticated_all" on prospects for all to authenticated using (true) with check (true);
create policy "authenticated_all" on deals for all to authenticated using (true) with check (true);
create policy "authenticated_all" on territories for all to authenticated using (true) with check (true);
create policy "authenticated_all" on call_scores for all to authenticated using (true) with check (true);
create policy "authenticated_all" on spoke_candidates for all to authenticated using (true) with check (true);
create policy "authenticated_all" on outreach_touches for all to authenticated using (true) with check (true);
