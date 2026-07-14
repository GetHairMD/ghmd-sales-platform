-- ─────────────────────────────────────────────────────────────────────────────
-- E-2 follow-up #4 — post_type and rep_id are immutable after creation.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (kjweckggegifjmmqccul) is never touched.
--
-- Decision #162 · PR #130 · Sol 5.6 gate run 29325541530 (2026-07-14), VERDICT: BLOCK.
--
-- THE FINDING (verbatim):
--   "The executive UPDATE policy permits changing any column and constrains only the
--    resulting `status`, so an executive can PATCH an existing row's `post_type` to
--    `bell_ringing` and fabricate a published bell without using ring_bell_on_funded_won().
--    Restricting `bell_ringing` only in INSERT policies does not make it trigger-written
--    only on every client verb."
--   STAKES: "An executive client can publish a false funded-close event that users may rely
--    on as genuine financial activity."
--
-- CONFIRMED LIVE before writing this migration, as the real QA-exec seat: publish an
-- innocuous 'win' post, then PATCH post_type -> 'bell_ringing' with the title
-- "🔔 QA Rep A closed Austin Westlake!". ACCEPTED. The row became a published bell — the
-- same fabricated close as BLOCK #3, reached through the OTHER verb.
--
-- ── THE SHAPE OF THE MISS (worth stating, because it recurred) ──────────────
-- BLOCK #2: the trigger owned the audit columns on UPDATE but not INSERT.
-- BLOCK #3: the policies restricted bell_ringing on INSERT but not UPDATE.
-- These are the same mistake in mirror image: an invariant was enforced on the verb we
-- happened to be thinking about, and the other verb was left open. Hence this migration
-- freezes the columns on the verb where they can change, and the freeze is UNCONDITIONAL
-- rather than predicated on a value — there is no "…except when" for a future reader to
-- reason around.
--
-- ── DECISION (Trace, confirmed): freeze BOTH post_type AND rep_id ───────────
-- Sol flagged post_type. rep_id was flagged proactively in the same review and is the
-- identical defect class: it is equally attribution-bearing and equally unguarded on
-- UPDATE, so an executive could silently re-attribute any post — including a real,
-- trigger-written bell — to a different rep. Both are facts ABOUT a post fixed at creation
-- ("what kind of event this was" / "who it happened to"), and neither is scoped for
-- revision anywhere in the spec, the brief, or this build. Freeze both now rather than wait
-- for the next round to catch rep_id on its own.
--
-- ── WHY THE TRIGGER, AND NOT THE UPDATE POLICY ──────────────────────────────
-- The naive fix — add `post_type <> 'bell_ringing'` to the exec UPDATE WITH CHECK — is
-- WRONG, and this is the crux of the round: WITH CHECK only ever sees the RESULTING row, and
-- cannot compare it to the prior one. So it would also DENY an executive pinning or
-- rejecting a GENUINE, trigger-written bell (whose resulting row is, of course, still
-- post_type='bell_ringing') — a real capability regression. RLS can say "the row must end up
-- satisfying X"; it cannot say "you may not CHANGE this column". That second statement is
-- exactly what is needed, and only a trigger can make it, because only a trigger sees OLD
-- and NEW together.
--
-- So this extends the ONE mechanism that already owns the columns a client must never set
-- (reviewed_by / reviewed_at, from BLOCK #2) to cover two more. One authority, not a second
-- differently-shaped one bolted alongside it.
--
-- ── STRUCTURE NOTE (not cosmetic) ───────────────────────────────────────────
-- The prior body was a FLAT if/elsif/else: `elsif new.status is distinct from old.status`
-- was a SIBLING of the INSERT branch. The freeze must apply to EVERY update — status-
-- changing or not — so the UPDATE arm becomes an `else` block that pins the two columns
-- FIRST, with the audit logic nested inside it. A freeze placed in only one of the old
-- sibling branches would have covered only half the updates.
--
-- ── SCOPE OF THE FREEZE (deliberate, and broader than RLS) ──────────────────
-- A trigger fires for EVERY writer, not only RLS-constrained clients — service_role and
-- postgres included. So post_type and rep_id are now immutable for SERVER-side code too, not
-- merely for a PostgREST client. That is intended: nothing in this product revises either
-- column, and a backfill that needed to would be a deliberate, reviewed act (a superuser can
-- ALTER TABLE … DISABLE TRIGGER for the duration). It is stated here so it is a known
-- property rather than a surprise.
--
-- The trigger is ALREADY registered BEFORE INSERT OR UPDATE (BLOCK #2's fix, 20260714190000)
-- — no re-registration is needed, and none is done. No RLS policy is touched this round. No
-- grant, column, or index change: the get_advisors surface is unchanged. Superseded via
-- CREATE OR REPLACE; every prior migration in this chain is applied live and is NOT edited
-- (supersede-never-delete).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stamp_community_board_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    -- A freshly inserted row — rep pending submission, executive direct-publish, or a
    -- trigger-written bell ring alike — has by definition not been through the review
    -- queue. The client never sets these; NULL is the only correct value, whatever was sent.
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    -- UPDATE. post_type and rep_id are IMMUTABLE after creation, on every client-facing
    -- verb and for every writer. Neither is scoped for revision anywhere in the product:
    -- post_type says what kind of event a post is (and bell_ringing asserts a real funded
    -- close), rep_id says who it is attributed to. Pinned unconditionally to their prior
    -- values, exactly as the audit columns are — rather than relying on a policy to express
    -- "you may not change this column", which WITH CHECK cannot say (it sees only the
    -- resulting row, never the prior one).
    new.post_type := old.post_type;
    new.rep_id    := old.rep_id;

    if new.status is distinct from old.status then
      -- A genuine review transition: stamp the CALLING executive and the real time.
      new.reviewed_by := (select auth.uid());
      new.reviewed_at := now();
    else
      -- Not a review transition (a pin, a copy-edit): the audit columns are immutable
      -- from the client side.
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.stamp_community_board_review() is
  'BEFORE INSERT OR UPDATE on community_board_posts (E-2). The SOLE authority over the four '
  'columns a client must never set: post_type, rep_id, reviewed_by, reviewed_at. '
  'On INSERT: forces reviewed_by/reviewed_at to NULL, whatever the client sent (a new row '
  'has not been reviewed — true of a rep''s pending submission, an executive''s '
  'direct-publish, and a trigger-written bell ring alike). '
  'On UPDATE: pins post_type and rep_id to their prior values UNCONDITIONALLY (both are '
  'fixed at creation and revised nowhere in the product — this closes the Second-Opinion '
  'Gate BLOCK on PR #130, where an executive could PATCH a published post''s post_type to '
  'bell_ringing and fabricate a funded close, or silently re-attribute any post to another '
  'rep); then stamps reviewed_by = auth.uid() and reviewed_at = now() when status changes, '
  'and otherwise pins the audit columns too. '
  'A trigger rather than an RLS WITH CHECK because only a trigger sees OLD and NEW together: '
  'WITH CHECK can say "the row must end up satisfying X" but cannot say "you may not CHANGE '
  'this column" — and banning post_type=bell_ringing in the resulting row would also block an '
  'executive from pinning or rejecting a GENUINE bell. '
  'SECURITY INVOKER by design — it must see the CALLING executive''s uid, which a DEFINER '
  'context would replace with the owner''s. The TG_OP = ''INSERT'' branch must come FIRST: '
  'OLD is unassigned on INSERT, so reaching any OLD reference would error. '
  'NOTE: this fires for EVERY writer, service_role and postgres included, so post_type and '
  'rep_id are immutable server-side too — intended, not an oversight.';

-- Explicit-grant discipline, restated: a function inherits the default PUBLIC EXECUTE grant,
-- which PostgREST would expose as a callable RPC. Trigger invocation does NOT check EXECUTE,
-- so revoking ALL closes that surface with zero effect on firing. Never granted back.
revoke all on function public.stamp_community_board_review() from public, anon, authenticated;

-- No trigger re-registration: community_board_posts_stamp_review is ALREADY
-- BEFORE INSERT OR UPDATE (20260714190000, BLOCK #2's fix). CREATE OR REPLACE FUNCTION
-- swaps the body in place, and the existing registration picks it up.
