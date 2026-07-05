-- ─────────────────────────────────────────────────────────────────────────────
-- Proposal System P2 (Session C) — extend the proposal_events event taxonomy.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Session B shipped a narrow CHECK allowing only session_start / section_view /
-- calculator_interaction. Session C adds sections 6–19 + Wistia + Calendly + full
-- §7 instrumentation, which introduces new event types. This migration ONLY widens
-- the CHECK constraint on the existing column — no new columns, no data change.
-- Dwell time rides in the existing payload jsonb ({ section, dwell_ms }) as the
-- section_dwell event, so no schema column is added for it.
--
-- The full type list here MUST stay in lock-step with
-- src/lib/proposal/events.ts (ALL_PROPOSAL_EVENT_TYPES). A Vitest test cross-checks
-- the two so they can't silently drift.
--
-- RLS: unchanged. proposal_events is already RLS-enabled, service-role-only (no
-- anon/authenticated policy — deny-by-default). This migration adds NO policy and
-- does not alter RLS. All writes still go through server-side service-role code:
--   • client events  → POST /p/[slug]/event (cookie-verified)
--   • session_start  → gate handler
--   • calendly_booked → verified Calendly webhook (server-side) only
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.proposal_events
  drop constraint if exists proposal_events_event_type_check;

alter table public.proposal_events
  add constraint proposal_events_event_type_check
  check (event_type = any (array[
    -- Session B (server + client)
    'session_start',
    'section_view',
    'calculator_interaction',
    -- Session C — client-emitted (POST /p/[slug]/event)
    'section_dwell',
    'video_play',
    'case_study_tab',
    'financing_cta_click',
    'calendly_open',
    'get_started_click',
    -- Session C — webhook-emitted (verified Calendly webhook only)
    'calendly_booked',
    'calendly_canceled'
  ]::text[]));

comment on table public.proposal_events is
  'Session C: first-party event log for /p/[slug]. event_type taxonomy is source-controlled in src/lib/proposal/events.ts (ALL_PROPOSAL_EVENT_TYPES) and cross-checked in tests. Service-role-only (RLS enabled, no anon/authenticated policy). Client events arrive via the cookie-gated /event route; session_start is server-emitted; calendly_booked only via the verified Calendly webhook. Dwell time rides in payload (section_dwell → { section, dwell_ms }).';
