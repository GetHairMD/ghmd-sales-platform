-- ─────────────────────────────────────────────────────────────────────────────
-- E-2 — Community Board: authoring + executive review (Session E, module 2).
-- Decisions #159 (Session E sequence), #162 (authorship/review model).
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (kjweckggegifjmmqccul) is never touched.
--
-- Depends on E-1 (PR #128, merged): public.community_board_posts + the
-- ring_bell_on_funded_won() SECURITY DEFINER trigger, and on the E-2 rep-seat
-- provisioning migration immediately preceding this one (decision #161).
--
-- ── WHAT THIS SUPERSEDES ────────────────────────────────────────────────────
-- E-1 shipped community_board_posts with NO client write path AT ALL: it revoked
-- insert/update/delete/truncate from `authenticated` and created exactly one policy
-- (a SELECT for any internal user). Its own table comment says the write path is
-- "E-2 scope". This migration IS that write path. It therefore re-GRANTS INSERT and
-- UPDATE to `authenticated` and adds the policies that constrain them.
--
-- The E-1 migration file is NOT edited (supersede-never-delete; it stays a truthful
-- record of what E-1 shipped, and its source-scan guardrail tests keep asserting
-- E-1's own text). The forward-facing table comment is rewritten at the bottom of
-- this file so the LIVE object describes the LIVE contract.
--
-- ── THE GRANT LAYER IS A SEPARATE LAYER FROM RLS (both directions) ──────────
-- E-1's lesson was "a revoked grant makes a policy moot." The inverse bites here:
-- a policy with NO matching grant is silently INERT — it leaks nothing, it just makes
-- every INSERT/UPDATE fail with a permission error that looks nothing like an RLS
-- denial. Both layers are set deliberately below:
--   • GRANT INSERT, UPDATE to authenticated  → coarse; says "this ROLE may attempt it"
--   • the four policies                      → fine; say "…only these ROWS, these values"
-- `authenticated` covers reps AND executives, so the grant alone authorises nothing
-- meaningful — every real constraint (who may publish, who may only submit pending,
-- who may review) is expressed in the policies. DELETE and TRUNCATE stay revoked:
-- nothing in E-2 deletes a post, and a rejected post is retained, not erased.
--
-- ── THE NO-SELF-APPROVAL INVARIANT (the security core of this PR) ───────────
-- A rep must never be able to publish their own post. Three independent things
-- enforce that, and all three must hold:
--   1. the rep INSERT policy admits status='pending' and NOTHING else;
--   2. there is NO rep UPDATE policy at all, so a rep cannot flip their own row's
--      status afterwards (nor edit anyone else's — there is no rep write-after-insert
--      path anywhere in this PR);
--   3. the executive review UPDATE policy is the ONLY thing that can move a row to
--      'published' or 'rejected', and its USING clause requires designation='executive'.
-- Note the interaction with the column default in §1 — it is a live tripwire, not an
-- accident. See the comment there.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Review columns ────────────────────────────────────────────────────────
-- status DEFAULT 'published' is REQUIRED, not merely convenient: the E-1
-- ring_bell_on_funded_won() trigger inserts (post_type, rep_id, territory_id, title,
-- body) and never names `status` (verified against the LIVE function definition, not
-- the migration file). A default of 'published' therefore carries every bell ring
-- straight to the feed with ZERO change to that SECURITY DEFINER function. Defaulting
-- to 'pending' instead would silently divert every celebration into a review queue.
--
-- ⚠ TRIPWIRE, by design: because the default is 'published', a rep INSERT that OMITS
-- status defaults to 'published' and is then DENIED by community_board_insert_rep_pending
-- (which admits only status='pending'). The rep write path MUST set status explicitly.
-- This is fail-closed — the failure mode of forgetting is "rep cannot post", never
-- "rep silently self-published". Pinned by test: "a rep INSERT omitting status is denied".
alter table public.community_board_posts
  add column if not exists status text not null default 'published',
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz;

-- Separate statement: `add column if not exists` will not attach the CHECK on a
-- re-run, so the constraint is added idempotently on its own.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.community_board_posts'::regclass
      and conname  = 'community_board_posts_status_check'
  ) then
    alter table public.community_board_posts
      add constraint community_board_posts_status_check
      check (status in ('pending','published','rejected'));
  end if;
end $$;

comment on column public.community_board_posts.status is
  'pending | published | rejected. DEFAULT ''published'' is load-bearing: the E-1 '
  'ring_bell_on_funded_won() trigger''s INSERT does not name this column, so the default '
  'keeps every bell ring publishing immediately with no change to that trigger. '
  'Consequence: the REP write path must set status=''pending'' EXPLICITLY, because an '
  'omitted status defaults to ''published'' and is then denied by the rep INSERT policy '
  '(fail-closed: forgetting means the rep cannot post, never that they self-published).';
comment on column public.community_board_posts.reviewed_by is
  'auth.uid() of the executive who approved/rejected. Stamped SERVER-SIDE by the '
  'stamp_community_board_review() BEFORE UPDATE trigger, never taken from the client — '
  'RLS can gate WHO updates but cannot force an honest audit value, so the reviewer '
  'identity is not client-forgeable even by an executive. NULL until first reviewed.';
comment on column public.community_board_posts.reviewed_at is
  'When the status transition happened. Stamped server-side by the same trigger. NULL '
  'until first reviewed. A pinned/edited post whose status did NOT change is not re-stamped.';

-- Existing rows (E-1 bell posts) take the 'published' default via ADD COLUMN — correct:
-- everything already on the board was, by construction, already live to every viewer.

-- The exec review queue reads WHERE status='pending' ordered by recency; the feed reads
-- WHERE status='published' ordered (pinned desc, created_at desc). E-1's feed index is
-- (pinned desc, created_at desc) with no status leg, so add a status-leading index.
create index if not exists community_board_posts_status_feed_idx
  on public.community_board_posts (status, pinned desc, created_at desc);

-- ── 2. Grant layer ───────────────────────────────────────────────────────────
-- Re-grant exactly the two verbs E-2 needs, and no more. anon stays fully revoked
-- (E-1 did `revoke all ... from anon`; restated here so this file is self-describing
-- and a future reader need not diff two migrations to know anon has nothing).
grant insert, update on public.community_board_posts to authenticated;
revoke delete, truncate on public.community_board_posts from authenticated;
revoke all on public.community_board_posts from anon;

-- ── 3. SELECT — split E-1's single policy into three ──────────────────────────
-- Postgres ORs permissive policies on the same command, so these three compose to:
--   "published to every internal user, OR your own row whatever its status,
--    OR anything at all if you are an executive."
-- Dropping E-1's community_board_select_internal is REQUIRED, not cosmetic: it grants
-- SELECT on every row to every internal user with no status predicate. Left in place it
-- would OR with the three below and hand every rep every other rep's pending and
-- rejected drafts — the exact leak AC5 exists to prevent.
drop policy if exists community_board_select_internal on public.community_board_posts;

drop policy if exists community_board_select_published on public.community_board_posts;
create policy community_board_select_published
  on public.community_board_posts
  as permissive
  for select
  to authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
    )
  );

-- A rep can always see their OWN submission and its outcome — including while pending
-- and after rejection (that is how they learn it was rejected). Scoped to rep_id =
-- auth.uid(), so it reveals nothing about any other author's unpublished drafts.
drop policy if exists community_board_select_own on public.community_board_posts;
create policy community_board_select_own
  on public.community_board_posts
  as permissive
  for select
  to authenticated
  using (rep_id = (select auth.uid()));

drop policy if exists community_board_select_executive_all on public.community_board_posts;
create policy community_board_select_executive_all
  on public.community_board_posts
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  );

-- ── 4. INSERT — executives publish directly; reps submit pending only ────────
-- Executive: any post_type, but pinned to status='published'. There is deliberately no
-- exec path that inserts a 'pending' row — an executive has no one to submit TO.
drop policy if exists community_board_insert_executive on public.community_board_posts;
create policy community_board_insert_executive
  on public.community_board_posts
  as permissive
  for insert
  to authenticated
  with check (
    status = 'published'
    and exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  );

-- Rep: pending only, self-authored only, and only the four SELF-SERVE post types.
--   • 'announcement' is withheld — an announcement carries institutional voice.
--   • 'bell_ringing' is withheld — it is trigger-written only; a client-forgeable bell
--     would let a rep fake a close on the celebration feed AND the scoreboard's framing.
-- (Per decision #162 this four-type restriction is Chat's stated default and was NOT
-- word-for-word confirmed by Trace — flagged in the PR body, not unilaterally altered.)
-- rep_id = auth.uid() forbids a rep submitting a post attributed to a DIFFERENT rep.
drop policy if exists community_board_insert_rep_pending on public.community_board_posts;
create policy community_board_insert_rep_pending
  on public.community_board_posts
  as permissive
  for insert
  to authenticated
  with check (
    status = 'pending'
    and rep_id = (select auth.uid())
    and post_type in ('win','materials','training','competitive')
    and exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'rep'
    )
  );

-- ── 5. UPDATE — executive review, and nothing else ───────────────────────────
-- The ONLY UPDATE policy on this table. No rep policy exists for UPDATE, so a rep's
-- update of ANY row — including their own pending submission — is denied. That is the
-- no-self-approval and no-self-edit invariant, enforced at the database.
--
-- SCOPE (deliberate, per the E-2 brief; escalate rather than silently change):
-- this does NOT column-lock the UPDATE to status/reviewed_by/reviewed_at. An executive
-- may amend title/body/pinned too. That is not a privilege escalation: an executive can
-- already INSERT arbitrary published content directly (§4), so a full-column UPDATE
-- grants them no authority they lack. The audit columns are protected by the trigger in
-- §6 regardless of what the client sends.
--
-- WITH CHECK admits only 'published' | 'rejected', so no UPDATE can move a row BACK to
-- 'pending' — review is a one-way transition out of the queue. USING has no status
-- predicate, so an executive may re-review (e.g. un-publish to 'rejected') a row that
-- was already decided; the trigger re-stamps the audit columns when they do.
drop policy if exists community_board_update_executive_review on public.community_board_posts;
create policy community_board_update_executive_review
  on public.community_board_posts
  as permissive
  for update
  to authenticated
  using (
    exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  )
  with check (
    status in ('published','rejected')
    and exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'executive'
    )
  );

-- No DELETE policy, and DELETE is revoked at the grant layer (§2). A rejected post is
-- retained, not erased — supersede-never-delete, applied to board content.

-- ── 6. Audit stamping — server-side, not client-supplied ─────────────────────
-- SECURITY INVOKER (the default) ON PURPOSE: the function must observe the CALLING
-- executive's auth.uid(). A SECURITY DEFINER here would resolve auth.uid() to the
-- definer and stamp the wrong reviewer. The RLS policy in §5 has already established
-- that only an executive can reach this trigger at all.
--
-- Fires only when status ACTUALLY changes (`is distinct from`, so a NULL-safe compare),
-- which means an executive pinning or copy-editing a post does not clobber the original
-- review audit trail. Overwrites whatever reviewed_by/reviewed_at the client sent —
-- the client cannot forge a reviewer identity or backdate a review.
create or replace function public.stamp_community_board_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  else
    -- Not a review transition: the audit columns are immutable from the client side.
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;

comment on function public.stamp_community_board_review() is
  'BEFORE UPDATE on community_board_posts (E-2). Stamps reviewed_by = auth.uid() and '
  'reviewed_at = now() whenever status changes, and otherwise pins both audit columns to '
  'their prior values. SECURITY INVOKER by design — it must see the CALLING executive''s '
  'uid, which a DEFINER context would replace with the owner''s. Makes the review audit '
  'trail non-forgeable: the reviewer identity is never taken from client input, even from '
  'an executive who could otherwise send any column value they liked.';

-- Same explicit-grant discipline as E-1's trigger functions: a function inherits the
-- default PUBLIC EXECUTE grant, which PostgREST would expose as a callable RPC. Trigger
-- invocation does NOT check EXECUTE, so revoking ALL closes that surface with zero effect
-- on firing. Never granted back — nobody calls this directly.
revoke all on function public.stamp_community_board_review() from public, anon, authenticated;

drop trigger if exists community_board_posts_stamp_review on public.community_board_posts;
create trigger community_board_posts_stamp_review
  before update on public.community_board_posts
  for each row
  execute function public.stamp_community_board_review();

-- ── 7. Forward-facing table comment (supersedes E-1's "no write path") ───────
comment on table public.community_board_posts is
  'Shared internal celebration/announcement/enablement feed (Session E). '
  'READ: published posts are visible to EVERY internal user (both designations); a rep '
  'additionally sees their OWN pending/rejected submissions; an executive sees everything. '
  'WRITE (added in E-2, decision #162 — supersedes E-1''s "no client INSERT path for any '
  'role", which was true only of E-1): an EXECUTIVE inserts any post_type directly as '
  'published; a REP may insert ONLY status=''pending'', rep_id=auth.uid(), and only the four '
  'self-serve types (win | materials | training | competitive) — never announcement, never '
  'bell_ringing. Only the executive review UPDATE policy can move a row to published or '
  'rejected; there is NO rep UPDATE policy, so no self-approval and no self-edit path '
  'exists. bell_ringing remains trigger-written only (ring_bell_on_funded_won, SECURITY '
  'DEFINER), landing published via the status column default. DELETE is revoked for every '
  'client role: a rejected post is retained, not erased.';
