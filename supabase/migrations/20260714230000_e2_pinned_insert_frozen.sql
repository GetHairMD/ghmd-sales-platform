-- ─────────────────────────────────────────────────────────────────────────────
-- E-2 follow-up #6 — `pinned` is insert-frozen to false, for every role.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (kjweckggegifjmmqccul) is never touched.
--
-- Decision #162 · PR #130 · Sol 5.6 gate run 29327798173 (2026-07-14), VERDICT: BLOCK.
--
-- THE FINDING (verbatim):
--   "The rep INSERT policy does not require `pinned = false`, and the INSERT trigger preserves
--    client-supplied `pinned`, so a rep can submit a pending post already pinned; approving it
--    by changing only `status` silently publishes a rep-pinned post. This violates the stated
--    invariant that `pinned` is client-mutable only by an executive."
--   STAKES: "A rep can control the prominence of their own published content without executive
--    authorization, while the approval UI gives the reviewer no indication that pinning is
--    also being approved."
--
-- CONFIRMED LIVE before writing this migration, as the real QA Rep A seat: an INSERT of
-- (status='pending', pinned=true) was ACCEPTED and stored pinned. The executive then approved
-- it by changing status ALONE — and it published with pinned=true, sorting first on the feed.
-- Verified live that neither guard existed: the rep INSERT policy makes no reference to
-- `pinned`, and the INSERT branch of this trigger passed client-supplied `pinned` straight
-- through.
--
-- ── THIS ONE LANDED ON A CLAIM, NOT JUST ON CODE ────────────────────────────
-- The BLOCK #5 migration's own column classification asserted:
--     "pinned  CLIENT-MUTABLE by an executive. This is how a real bell is highlighted."
-- That was FALSE at the INSERT boundary, and it was false in the very table written to
-- demonstrate completeness. The deny-by-default reset introduced in #5 governs bell UPDATEs;
-- the question "who is allowed to SET this on INSERT?" was never asked of `pinned`. Stating an
-- invariant out loud is what made the gap visible — which is the argument for stating them.
--
-- ── DECISION (Trace): option 1 — pinned := false on INSERT, for EVERY role ──
-- No caller-role check is added to the trigger; it stays role-agnostic. An executive who wants
-- a pre-pinned post does it in two calls (insert, then pin) — which costs nothing real today,
-- because no UI path offers one-shot pinned publish: neither SubmitPostForm nor the submitPost
-- server action ever sends `pinned` at all. The hole was only ever reachable by calling
-- PostgREST directly — which is exactly the standard this PR has held to throughout: the UI is
-- not the boundary, RLS and the triggers are.
--
-- Deliberately NOT fixed by adding `pinned = false` to the rep INSERT policy's WITH CHECK.
-- That would reject rather than neutralise, would leave the EXECUTIVE insert path unguarded,
-- and is the mechanism this build has twice concluded is the weaker one (a policy expressing
-- column-VALUE integrity). The trigger already owns every column a client must not set on
-- INSERT — reviewed_by, reviewed_at, created_at. `pinned` joins them. One authority.
--
-- ── CORRECTED CLASSIFICATION for `pinned` (supersedes BLOCK #5's line) ──────
--   pinned  INSERT-FROZEN to false for every role; EXECUTIVE-MUTABLE thereafter, via UPDATE
--           only (the review UPDATE policy is the sole UPDATE policy on this table — no rep
--           UPDATE policy exists). Pinning is therefore always a deliberate, separate,
--           executive act on an existing row, never something that rides in on a submission.
--
-- Everything else from #5 stands unchanged: id / created_at / post_type / rep_id frozen on
-- every row; reviewed_by / reviewed_at trigger-owned; a bell row reset to old.* on UPDATE with
-- only status and pinned re-applied.
--
-- Scope: this function ONLY. No RLS policy touched. No trigger re-registration (already
-- BEFORE INSERT OR UPDATE). No grant, column, or index change — get_advisors unchanged.
-- Superseded via CREATE OR REPLACE; every prior migration in this chain is applied live and is
-- NOT edited (supersede-never-delete).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stamp_community_board_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  keep_status text;     -- status is TEXT (only `pinned` is boolean)
  keep_pinned boolean;
begin
  if TG_OP = 'INSERT' then
    -- Columns no client may set on creation, for ANY role:
    --   • reviewed_by / reviewed_at — a new row has not been reviewed (rep pending submission,
    --     executive direct-publish, and trigger-written bell alike).
    --   • created_at — no post is ever created backdated.
    --   • pinned — prominence is an EXECUTIVE act on an EXISTING row, never something that
    --     rides in on a submission. Without this, a rep could submit an already-pinned pending
    --     post and an executive approving it by changing status alone would silently publish
    --     it to the top of the feed, with nothing in the review UI to indicate that pinning
    --     was also being approved.
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.created_at  := now();
    new.pinned      := false;
  else
    -- Immutable on EVERY row, of every post_type, through any verb.
    new.id         := old.id;
    new.created_at := old.created_at;
    new.post_type  := old.post_type;
    new.rep_id     := old.rep_id;

    if old.post_type = 'bell_ringing' then
      -- A bell asserts a real funded close. DENY BY DEFAULT: reset the entire row to its
      -- stored value, then re-apply ONLY the two fields moderation legitimately needs. Never
      -- a list of columns to freeze — that is what failed four times; a column added to this
      -- table tomorrow is frozen here automatically.
      keep_status := new.status;
      keep_pinned := new.pinned;
      new := old;
      new.status := keep_status;
      new.pinned := keep_pinned;
    end if;

    -- Audit stamping runs AFTER the bell reset, and sets these two explicitly either way, so
    -- `new := old` above cannot resurrect a stale audit value.
    if new.status is distinct from old.status then
      new.reviewed_by := (select auth.uid());
      new.reviewed_at := now();
    else
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.stamp_community_board_review() is
  'BEFORE INSERT OR UPDATE on community_board_posts (E-2). Enforces this table''s content '
  'invariants DENY-BY-DEFAULT rather than by enumerating columns. '
  'ON INSERT, no client of any role may set: reviewed_by / reviewed_at (a new row has not been '
  'reviewed), created_at (no post is backdatable), or pinned (prominence is an executive act on '
  'an EXISTING row — otherwise a rep could submit an already-pinned pending post and an '
  'executive approving it by status alone would silently publish it to the top of the feed). '
  'ON UPDATE: id / created_at / post_type / rep_id are immutable on every row; a bell_ringing '
  'row is reset to its stored value in full (`new := old`) with ONLY status and pinned '
  're-applied, so a column added to this table in future is frozen on bells AUTOMATICALLY '
  'instead of silently inheriting the hole; reviewed_by / reviewed_at are stamped from '
  'auth.uid()/now() on a genuine status transition and preserved otherwise. '
  'CLIENT-MUTABLE: status and pinned via the executive review UPDATE policy (the sole UPDATE '
  'policy — no rep UPDATE policy exists); title / body / territory_id on NON-bell rows only. '
  'Closes six Second-Opinion Gate BLOCKs on PR #130. '
  'SECURITY INVOKER by design — it must see the CALLING executive''s uid. TG_OP=''INSERT'' is '
  'checked FIRST: OLD is unassigned on INSERT, so any OLD reference would error. '
  'A trigger rather than an RLS WITH CHECK because only a trigger sees OLD and NEW together. '
  'NOTE: fires for EVERY writer, service_role and postgres included — these freezes bind '
  'server-side code too. Intended.';

comment on column public.community_board_posts.pinned is
  'Feed prominence. INSERT-FROZEN to false for EVERY role (the trigger overrides whatever the '
  'client sends); EXECUTIVE-MUTABLE thereafter via UPDATE only. Pinning is therefore always a '
  'deliberate, separate executive act on an existing row — never something that rides in on a '
  'rep''s submission and gets published by an approval that only changed status. Corrects the '
  'BLOCK #5 classification, which claimed pinned was "client-mutable by an executive" while the '
  'INSERT path in fact accepted it from anyone (Second-Opinion Gate BLOCK #6, PR #130).';

-- Explicit-grant discipline, restated: a function inherits the default PUBLIC EXECUTE grant,
-- which PostgREST would expose as a callable RPC. Trigger invocation does NOT check EXECUTE, so
-- revoking ALL closes that surface with zero effect on firing. Never granted back.
revoke all on function public.stamp_community_board_review() from public, anon, authenticated;
