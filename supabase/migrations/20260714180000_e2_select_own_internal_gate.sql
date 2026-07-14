-- ─────────────────────────────────────────────────────────────────────────────
-- E-2 follow-up — close the Second-Opinion Gate BLOCK on community_board_select_own.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (kjweckggegifjmmqccul) is never touched.
--
-- Decision #162 · PR #130 · Sol 5.6 gate run 87048875500 (2026-07-14), VERDICT: BLOCK.
--
-- THE FINDING (verbatim):
--   "The `community_board_select_own` policy checks only `rep_id = auth.uid()` and does not
--    require current `internal_users` membership or `designation = 'rep'`. A removed or
--    otherwise non-internal authenticated account can therefore continue reading its
--    pending/rejected posts, bypassing the internal allow-list used by the other SELECT
--    policies."
--   STAKES: "An offboarded user could retain access to unpublished Community Board content
--    that may contain sensitive customer, deal, or internal business information."
--
-- CONFIRMED LIVE against pg_policies before writing this migration (not taken from the PR
-- diff's own description). Every OTHER policy on this table gates on live internal_users
-- membership — select_published (membership), select_executive_all (designation), both
-- INSERT policies (designation), and the review UPDATE (designation, in BOTH using and
-- with check). select_own was the single exception:
--
--     USING (rep_id = (select auth.uid()))          -- ← no allow-list check at all
--
-- Why that is a real hole and not a theoretical one: removing a user from internal_users is
-- THE offboarding control in this system (Hard Rule 10 remediation, #86/#105). Every other
-- surface goes dark the instant that row is deleted. This policy did not — a still-valid JWT
-- for a de-listed account kept SELECT on every row it had authored, including unpublished
-- pending and rejected drafts. RLS is evaluated per-statement against live table state, so
-- the allow-list check has to be IN the policy; nothing outside it was enforcing this.
--
-- THE FIX: require the caller to still be a current internal user with designation='rep',
-- matching the sibling policies. `designation = 'rep'` rather than a bare membership EXISTS
-- is deliberate and is the tighter of the two: this policy exists solely so a REP can watch
-- their own submission's outcome. An executive never needs it — community_board_select_executive_all
-- is strictly broader (any row, any status, any author) — so scoping to 'rep' removes a
-- redundant read path instead of leaving one lying around. It also mirrors the rep INSERT
-- policy's own designation check exactly, so the identity that may CREATE a pending post is
-- precisely the identity that may READ it back.
--
-- Superseded the normal way (drop + create), NOT by editing 20260714170100, which is applied
-- live and whose guardrail tests source-scan it — editing it would falsify the record of what
-- that migration actually shipped (supersede-never-delete). This is the same pattern
-- 20260714170100 itself used to supersede E-1's community_board_select_internal.
--
-- Scope: this policy ONLY. The other five on this table are correct as reviewed and are not
-- touched. No grant, function, column, or index changes — a strict tightening, so the
-- get_advisors surface is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists community_board_select_own on public.community_board_posts;

create policy community_board_select_own
  on public.community_board_posts
  as permissive
  for select
  to authenticated
  using (
    rep_id = (select auth.uid())
    and exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'rep'
    )
  );

comment on table public.community_board_posts is
  'Shared internal celebration/announcement/enablement feed (Session E). '
  'READ: published posts are visible to EVERY internal user (both designations); a CURRENT '
  'rep additionally sees their OWN pending/rejected submissions; an executive sees everything. '
  'EVERY policy on this table — without exception — gates on live internal_users membership, '
  'so deleting a user''s internal_users row (the offboarding control, Hard Rule 10 / #86 / #105) '
  'revokes every read and write path here immediately, including access to their own '
  'unpublished drafts (closed by the Second-Opinion Gate BLOCK on PR #130; select_own was the '
  'one policy that previously missed this check). '
  'WRITE (E-2, decision #162 — supersedes E-1''s "no client INSERT path for any role"): an '
  'EXECUTIVE inserts any post_type directly as published; a REP may insert ONLY '
  'status=''pending'', rep_id=auth.uid(), and only the four self-serve types (win | materials | '
  'training | competitive) — never announcement, never bell_ringing. Only the executive review '
  'UPDATE policy can move a row to published or rejected; there is NO rep UPDATE policy, so no '
  'self-approval and no self-edit path exists. bell_ringing remains trigger-written only '
  '(ring_bell_on_funded_won, SECURITY DEFINER), landing published via the status column '
  'default. DELETE is revoked for every client role: a rejected post is retained, not erased.';
