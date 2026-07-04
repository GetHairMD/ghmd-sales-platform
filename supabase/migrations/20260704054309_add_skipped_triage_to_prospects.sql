-- Soft triage gate flag (crm-demo-v1 P1). Applied to prod as version 20260704054309.
-- Mirrors skipped_funding_prequal. Fulfills the PRD M6 skipped_triage flag early —
-- needed so the TRIAGE SKIPPED badge and the soft triage gate (4->5, PRD §2.3) render
-- from real state in the demo. Project cprltmwwldbxcsunsafl. NIP never touched. RLS unchanged.

alter table public.prospects
  add column skipped_triage boolean not null default false;

comment on column public.prospects.skipped_triage is
  'Advanced to Proposal Sent (stage 5) without a completed triage. Drives the amber TRIAGE SKIPPED badge. Mirrors skipped_funding_prequal (soft triage gate, PRD §2.3 / decision #53).';
