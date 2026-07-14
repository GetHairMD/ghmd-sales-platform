-- ─────────────────────────────────────────────────────────────────────────────
-- E-2 follow-up #3 — bell_ringing is trigger-only for EVERY client role, no exception.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (kjweckggegifjmmqccul) is never touched.
--
-- Decision #162 · PR #130 · Sol 5.6 gate run 29324328208 (2026-07-14), VERDICT: BLOCK.
--
-- THE FINDING (verbatim):
--   "The executive INSERT policy does not restrict `post_type`, so an executive can bypass
--    the server action and directly INSERT a published `bell_ringing` row through PostgREST.
--    This contradicts the claim that `bell_ringing` is trigger-written only and permits a
--    fabricated close."
--   STAKES: "A client can publish a false financial event to the celebration feed that users
--    may treat as evidence of a genuine funded deal."
--
-- CONFIRMED LIVE before writing this migration, twice over:
--   • pg_policies: community_board_insert_executive's WITH CHECK is
--       (status = 'published' AND EXISTS(internal_users … designation = 'executive'))
--     with NO post_type reference at all. The REP policy does restrict post_type; the exec
--     policy simply never did.
--   • Reproduced through RLS as the real QA-exec seat: an INSERT of
--       post_type='bell_ringing', status='published', title='🔔 QA Rep A closed Austin Westlake!'
--     was ACCEPTED and STORED — a fabricated close, live on the celebration feed, attributed
--     to a rep who never closed anything. (Probe row deleted.)
--
-- This contradicted an invariant THIS PR ITSELF asserts, in the E-2 table comment and in the
-- rep INSERT policy's own rationale: "bell_ringing remains trigger-written only." That was
-- true of the rep path and of the application layer (the submit form never offers an
-- executive a bell option — see EXEC_SUBMITTABLE_POST_TYPES), but it was NOT true at the
-- database for an executive going direct to PostgREST. The UI is not the boundary; RLS is.
--
-- DESIGN DECISION (Trace, confirmed): there is no manual bell-authorship path, and none is
-- planned. A bell asserts a FINANCIAL EVENT — that a real deal closed and a real territory
-- was sold — and the only thing entitled to assert it is the close itself. So the gap is
-- closed COMPLETELY (bell_ringing unreachable from every client-facing INSERT policy), not
-- partially. No manual-bell feature is added.
--
-- THE FIX: add `post_type <> 'bell_ringing'` to the executive INSERT policy, mirroring the
-- rep policy, which already excludes it by enumerating only the four self-serve types.
-- After this, the two client-facing INSERT policies BOTH exclude bell_ringing, so the ONLY
-- path that can ever produce a bell_ringing row is ring_bell_on_funded_won() — SECURITY
-- DEFINER, owned by postgres, and (since relforcerowsecurity is false on this table) not
-- subject to these policies at all. That bypass is not an assumption: the AC3-style
-- throwaway-prospect probe re-run after this migration proves the trigger still publishes.
--
-- `<>` (not IS DISTINCT FROM) is correct because post_type is NOT NULL — there is no NULL
-- case to leak through. Were it nullable, `NULL <> 'bell_ringing'` would evaluate to NULL,
-- which a WITH CHECK treats as a DENIAL (fail-closed) — so even then it would not leak, but
-- the NOT NULL constraint is what makes the simple form unambiguous.
--
-- Scope: this ONE policy. The trigger function is NOT touched (the BLOCK #2 fix in
-- 20260714190000 is correct and unrelated). No grant, function, column, or index change —
-- the get_advisors surface is unchanged. Superseded via drop + create; 20260714170100,
-- 20260714180000 and 20260714190000 are all applied live and are NOT edited
-- (supersede-never-delete).
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists community_board_insert_executive on public.community_board_posts;

create policy community_board_insert_executive
  on public.community_board_posts
  as permissive
  for insert
  to authenticated
  with check (
    status = 'published'
    and post_type <> 'bell_ringing'
    and exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  );

comment on column public.community_board_posts.post_type is
  'bell_ringing is TRIGGER-WRITTEN ONLY, and this is now enforced at the database for EVERY '
  'client role, not merely in the UI: the rep INSERT policy enumerates only the four '
  'self-serve types, and the executive INSERT policy excludes bell_ringing explicitly '
  '(closed by the Second-Opinion Gate BLOCK on PR #130, where an executive could POST a '
  'fabricated close straight through PostgREST, bypassing the submit form). The sole '
  'producer of a bell_ringing row is ring_bell_on_funded_won() — SECURITY DEFINER, owned by '
  'postgres, and so not subject to these policies. A bell asserts a real financial event (a '
  'funded close); only the close itself may assert it. The other five types are '
  'client-authored: an executive may publish any of them directly; a rep may submit '
  'win | materials | training | competitive for review.';

comment on table public.community_board_posts is
  'Shared internal celebration/announcement/enablement feed (Session E). '
  'READ: published posts are visible to EVERY internal user (both designations); a CURRENT '
  'rep additionally sees their OWN pending/rejected submissions; an executive sees everything. '
  'EVERY policy on this table — without exception — gates on live internal_users membership, '
  'so deleting a user''s internal_users row (the offboarding control, Hard Rule 10 / #86 / #105) '
  'revokes every read and write path here immediately, including access to their own '
  'unpublished drafts. '
  'WRITE (E-2, decision #162 — supersedes E-1''s "no client INSERT path for any role"): an '
  'EXECUTIVE inserts any post_type EXCEPT bell_ringing directly as published; a REP may insert '
  'ONLY status=''pending'', rep_id=auth.uid(), and only the four self-serve types (win | '
  'materials | training | competitive). NEITHER client role can insert bell_ringing — it is '
  'trigger-written only (ring_bell_on_funded_won, SECURITY DEFINER), landing published via the '
  'status column default, because a bell asserts a real funded close and only the close may '
  'assert it. '
  'AUDIT: reviewed_by / reviewed_at are set ONLY by stamp_community_board_review() on INSERT '
  'and UPDATE alike — never by the client (NULL on insert; auth.uid()/now() on a genuine status '
  'transition; preserved on a pin or copy-edit). '
  'REVIEW: only the executive review UPDATE policy can move a row to published or rejected, '
  'one-way; there is NO rep UPDATE policy, so no self-approval and no self-edit path exists. '
  'DELETE is revoked for every client role: a rejected post is retained, not erased. '
  '(Three Second-Opinion Gate BLOCKs closed on PR #130: select_own allow-list gating, '
  'INSERT-side audit forgery, and executive bell_ringing forgery.)';
