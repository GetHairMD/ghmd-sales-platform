-- ─────────────────────────────────────────────────────────────────────────────
-- Session D (D5) — add proposals.alignment_bullets for §6.7 Practice Alignment.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Spec §5 lists alignment_bullets (4 × title+body) as a *variable* per-prospect
-- field; Session C shipped a template default (src/components/proposal/constants.ts
-- ALIGNMENT_BULLETS) pending this per-prospect model. Adds one nullable jsonb column
-- to the existing 1:1 proposals table. Section 7 falls back to the template default
-- when NULL, so this is backward-compatible with the one seeded proposal.
--
-- RLS: unchanged. proposals is already RLS-enabled, service-role-only (no
-- anon/authenticated policy — deny-by-default). This migration adds no policy.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.proposals
  add column alignment_bullets jsonb;

comment on column public.proposals.alignment_bullets is
  'Session D (§6.7): per-prospect Practice Alignment fit bullets — jsonb array of {title, body} (4 by convention, not DB-enforced; render pads/caps). Trace-supplied/approval-gated content; NULL falls back to the template default in src/components/proposal/constants.ts. Not demand/qualification data.';
