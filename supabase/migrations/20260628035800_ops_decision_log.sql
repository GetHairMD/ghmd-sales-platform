-- Decision Log — ops schema + decision_log table.
-- Append-only record of consequential decisions for the GHMD Sales Platform.
-- Companion data scripts (run after this migration):
--   scripts/seed_capture_taxonomy.sql   — Capture Taxonomy v1 seed (load FIRST)
--   scripts/backfill_decision_log.sql   — historical backfill from the frozen Google Doc archive
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).

create schema if not exists ops;

create table ops.decision_log (
  id            bigint generated always as identity primary key,
  decided_on    date not null,
  platform      text not null default 'sales' check (platform in ('sales','nip','cross')),
  title         text not null,
  decision      text not null,
  reasoning     text,
  status        text not null check (status in
                  ('ADOPTED','LOCKED','PLANNED','REJECTED','CONFIRMED','SUPERSEDED','OPEN')),
  legal_flag    boolean not null default false,
  superseded_by bigint references ops.decision_log(id),
  source_session text,
  created_at    timestamptz not null default now()
);

revoke delete on ops.decision_log from authenticated, anon;

alter table ops.decision_log enable row level security;
create policy "admin read"  on ops.decision_log for select using (auth.role() = 'service_role');
create policy "admin write" on ops.decision_log for insert with check (auth.role() = 'service_role');

create index on ops.decision_log (platform, status);
create index on ops.decision_log (decided_on desc);
