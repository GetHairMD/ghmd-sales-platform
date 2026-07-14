-- ─────────────────────────────────────────────────────────────────────────────
-- E-2 follow-up #2 — close the Second-Opinion Gate BLOCK on INSERT-side audit forgery.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (kjweckggegifjmmqccul) is never touched.
--
-- Decision #162 · PR #130 · Sol 5.6 gate run 29323185511 (2026-07-14), VERDICT: BLOCK.
--
-- THE FINDING (verbatim):
--   "The INSERT policies do not constrain `reviewed_by` or `reviewed_at`, while
--    `stamp_community_board_review()` fires only on UPDATE. A rep or executive can therefore
--    insert client-supplied audit values, and an executive's directly published row can
--    retain a forged reviewer and timestamp indefinitely."
--   STAKES: "The database can contain a fabricated review audit trail falsely attributing
--    approval to another user or time."
--
-- CONFIRMED LIVE before writing this migration, twice over:
--   • pg_trigger: community_board_posts_stamp_review fires "BEFORE UPDATE" — there is no
--     INSERT-side path at all.
--   • Reproduced through RLS as the real QA Rep A seat: an INSERT carrying
--     reviewed_by = <the executive's uuid>, reviewed_at = '1999-01-01' was ACCEPTED and
--     STORED with those exact values. The row's audit trail claimed an executive had
--     approved it, in 1999, before the row existed.
--
-- Same category as E-1's funded_won_at forgery fix (#128): a durable, trusted column that
-- nothing stopped a client from writing directly.
--
-- ── WHY THE TRIGGER, AND NOT AN `IS NULL` CHECK ON THE INSERT POLICIES ──────
-- Adding `reviewed_by is null and reviewed_at is null` to the two INSERT policies' WITH
-- CHECK would also close the hole — and is deliberately NOT the approach taken (brief's
-- explicit call, not an oversight). It would make an RLS policy the thing enforcing
-- column-VALUE integrity, which is a weaker mechanism than the one this table already has:
-- the UPDATE trigger already embodies the correct principle — the client NEVER sets these
-- two columns; the trigger does, unconditionally. Extending that one principle to cover
-- INSERT keeps a SINGLE authority over the audit columns, rather than bolting a second,
-- differently-shaped mechanism onto the INSERT side that a future policy edit could quietly
-- drop. One mechanism, both verbs.
--
-- ── WHY NULL, RATHER THAN REJECTING THE INSERT ──────────────────────────────
-- A freshly inserted row has BY DEFINITION not been through the review queue — that is true
-- of a rep's pending submission, of an executive's direct-publish (which skips review
-- entirely, so it was never "reviewed" by anyone), and of a trigger-written bell_ringing
-- post. NULL is therefore the only correct value in every case, so the trigger can force it
-- unconditionally without needing to know which path it is on. Neutralising the forged
-- payload also beats rejecting it: a rejection would push enforcement back out into error
-- handling and tell a prober exactly which column tripped the check.
--
-- ── WHY THE TG_OP GUARD MUST COME FIRST ─────────────────────────────────────
-- The existing body compares `new.status is distinct from old.status`. On an INSERT, OLD is
-- UNASSIGNED in PL/pgSQL — reaching that comparison would ERROR, not fall through. So the
-- TG_OP = 'INSERT' branch is not stylistic: without it, extending this trigger to INSERT
-- would break every write to the table, including the E-1 bell-ringing trigger's insert.
--
-- ── THE UPDATE PATH IS BIT-FOR-BIT UNCHANGED ────────────────────────────────
-- The elsif/else branches below are byte-identical to the live definition (verified against
-- pg_get_functiondef before editing). A genuine review still stamps auth.uid()/now(); a
-- forged UPDATE is still overridden; a pin/edit that does not change status still preserves
-- the prior audit values. Re-proven live after this migration, not assumed.
--
-- Scope: this function + its trigger registration ONLY. No RLS policy is touched in this
-- migration (the six are correct as reviewed). No grant, column, or index change — the
-- get_advisors surface is unchanged. Superseded via CREATE OR REPLACE + drop/create trigger;
-- 20260714170100 and 20260714180000 are both applied live and are NOT edited
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
    -- queue. The client never gets to set these columns, on INSERT or UPDATE; NULL is the
    -- only correct value here regardless of what was sent. Forged values are silently
    -- neutralised rather than rejected.
    new.reviewed_by := null;
    new.reviewed_at := null;
  elsif new.status is distinct from old.status then
    -- A genuine review transition: stamp the CALLING executive and the real time.
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  else
    -- Not a review transition (a pin, a copy-edit): the audit columns are immutable from
    -- the client side.
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;

comment on function public.stamp_community_board_review() is
  'BEFORE INSERT OR UPDATE on community_board_posts (E-2). The SOLE authority over '
  'reviewed_by / reviewed_at — the client never sets them on either verb. '
  'On INSERT: forces both to NULL, whatever the client sent (a new row has not been '
  'reviewed — true of a rep''s pending submission, an executive''s direct-publish, and a '
  'trigger-written bell ring alike). Closes the Second-Opinion Gate BLOCK on PR #130, where '
  'a rep could INSERT a post carrying reviewed_by=<an executive''s uuid> and a backdated '
  'reviewed_at, fabricating an approval that never happened. '
  'On UPDATE: stamps reviewed_by = auth.uid() and reviewed_at = now() when status changes, '
  'and otherwise pins both to their prior values. SECURITY INVOKER by design — it must see '
  'the CALLING executive''s uid, which a DEFINER context would replace with the owner''s. '
  'The TG_OP = ''INSERT'' branch must come FIRST: OLD is unassigned on INSERT, so reaching '
  'the status comparison would error rather than fall through.';

-- Same explicit-grant discipline as before: a function inherits the default PUBLIC EXECUTE
-- grant, which PostgREST would expose as a callable RPC. Trigger invocation does NOT check
-- EXECUTE, so revoking ALL closes that surface with zero effect on firing. Never granted back.
revoke all on function public.stamp_community_board_review() from public, anon, authenticated;

-- Re-register: BEFORE INSERT OR UPDATE (was BEFORE UPDATE only — the gap).
drop trigger if exists community_board_posts_stamp_review on public.community_board_posts;
create trigger community_board_posts_stamp_review
  before insert or update on public.community_board_posts
  for each row
  execute function public.stamp_community_board_review();
