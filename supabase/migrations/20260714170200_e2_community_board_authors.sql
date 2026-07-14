-- ─────────────────────────────────────────────────────────────────────────────
-- E-2 — community_board_authors(): display names for board post authors.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
--
-- WHY THIS EXISTS (a gap the E-2 brief's policy sketch did not anticipate):
-- the executive Pending Review queue must show WHO submitted each post, and the feed
-- attributes authored posts. community_board_posts.rep_id is an FK to auth.users, NOT
-- to internal_users, so PostgREST cannot embed the name. And public.internal_users has
-- exactly ONE policy — `self_read` (user_id = auth.uid()) — so even an EXECUTIVE cannot
-- read another user's internal_users row through the authenticated client. Without this
-- function the review queue could only render raw UUIDs.
--
-- Three alternatives were rejected:
--   • Widen internal_users RLS with an exec-read-all policy — expands the read surface of
--     the allow-list table itself (the Hard-Rule-10 control, #86/#105) to serve a display
--     concern. Wrong table to loosen.
--   • Denormalise an author_name column onto community_board_posts — a rep controls their
--     own INSERT, so they could author a post under a forged display name.
--   • Show UUIDs — unusable.
--
-- DISCLOSURE: this is NOT a new disclosure. scoreboard_summary() (E-1) already returns
-- rep_id + rep_name for EVERY rep to EVERY internal user — rep names are already an
-- internal-public fact. This adds executives, whose full_name is NULL in production today
-- (verified live), so they resolve to the generic institutional label rather than to any
-- personal name. It returns ONLY user_id + a display label: no designation, no email, no
-- prospect/territory/addressable data. designation is deliberately withheld — the board
-- has no reason to tell a rep who the executives are.
--
-- Gated on internal_users membership (fail closed: a non-internal caller gets zero rows),
-- EXECUTE to authenticated only, never anon — same lockdown discipline as E-1's RPCs.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.community_board_authors()
returns table (
  user_id      uuid,
  display_name text
)
language sql
security definer
set search_path = ''
as $$
  select
    iu.user_id,
    -- CLAUDE.md: full_name is nullable — never render 'null'. An executive posts with the
    -- institutional voice, and today both execs have a NULL full_name, so the fallback is
    -- the brand label rather than a personal one.
    coalesce(nullif(btrim(iu.full_name), ''), 'GetHairMD') as display_name
  from public.internal_users iu
  where exists (
    select 1 from public.internal_users me where me.user_id = auth.uid()
  );
$$;

revoke all on function public.community_board_authors() from public, anon, authenticated;
grant execute on function public.community_board_authors() to authenticated;

comment on function public.community_board_authors() is
  'Author display names for the Community Board (E-2). SECURITY DEFINER, search_path '
  'pinned, gated on internal_users membership, EXECUTE to authenticated only (never anon). '
  'Exists because community_board_posts.rep_id FKs to auth.users, and internal_users has '
  'ONLY a self_read policy — so not even an executive can read another user''s name through '
  'the authed client, leaving the review queue with nothing but UUIDs. Returns ONLY '
  '(user_id, display_name): no designation, no email, no prospect/territory data. NOT a new '
  'disclosure — scoreboard_summary() already exposes every rep''s name to every internal '
  'user. NULL/blank full_name falls back to the institutional "GetHairMD" label.';
