-- ─────────────────────────────────────────────────────────────────────────────
-- E-2 follow-up #5 — enforce the INVARIANT, not the columns named so far.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (kjweckggegifjmmqccul) is never touched.
--
-- Decision #162 · PR #130 · Sol 5.6 gate run 29326808223 (2026-07-14), VERDICT: BLOCK.
--
-- THE FINDING (verbatim):
--   "The executive UPDATE policy still permits changing a genuine bell's title, body,
--    territory_id, created_at, and other event-defining fields; the trigger restores only
--    post_type, rep_id, reviewed_by, and reviewed_at. An executive can therefore repurpose
--    one real bell into a published claim for a different or fabricated funded close without
--    invoking the close trigger."
--   STAKES: "Users could rely on a materially falsified bell as evidence of funded financial
--    activity even though the database presents it as trigger-originated."
--
-- CONFIRMED LIVE before writing this migration: a GENUINE, trigger-written bell
-- ("🔔 QA Rep A closed a deal!") was rewritten by the QA-exec seat into
-- "🔔 QA Rep A closed Beverly Hills — $1.2M!", with a fabricated body, territory_id
-- re-pointed at a different territory, and created_at back-dated to 2020 — while post_type
-- stayed 'bell_ringing', so the row still PRESENTED as trigger-originated.
--
-- ── WHY THIS KEEPS HAPPENING (the actual root cause) ────────────────────────
-- BLOCK #2: audit columns guarded on UPDATE but not INSERT.
-- BLOCK #3: bell_ringing restricted on INSERT but not UPDATE.
-- BLOCK #4: post_type + rep_id frozen — the columns that had just been named.
-- BLOCK #5: title / body / territory_id / created_at — the columns that had NOT been named.
-- Each round closed exactly the door the reviewer had just walked through. The mistake was
-- never a missing column; it was ENUMERATING columns at all. An allow-list of frozen columns
-- means every column added to this table in future silently inherits the HOLE. So this
-- migration stops enumerating and states the invariant:
--
--     A bell's content is authored SOLELY by the close trigger. No client may alter any
--     part of what a bell asserts, ever, through any verb. The only client-mutable surface
--     on a bell row is `status` (reject a bad bell) and `pinned` (highlight a real one).
--     created_at, post_type, rep_id and id are immutable on EVERY row, of every type.
--
-- ── IMPLEMENTED DENY-BY-DEFAULT, BY CONSTRUCTION ────────────────────────────
-- For a bell row the trigger does `new := old` — resetting the ENTIRE row — and then
-- re-applies exactly the two permitted fields. It does NOT list the columns to freeze. The
-- consequence is the point: a column added to this table tomorrow is frozen on bell rows
-- AUTOMATICALLY, because it is covered by `new := old` without anyone remembering it.
-- The failure mode of forgetting flips from "silently exposed" to "silently protected".
--
-- ── TWO BUGS IN THE BRIEF'S SKETCH, CAUGHT BEFORE APPLYING ──────────────────
--  1. The sketch declared `keep_status boolean := new.status`. status is TEXT (verified live:
--     text, NOT NULL, default 'published'); only `pinned` is boolean. Declared text here.
--  2. The sketch froze created_at/post_type/rep_id table-wide but left `id` mutable on
--     NON-bell rows — an executive could PATCH a post's primary key and silently re-key it.
--     Identical defect class to everything above, and the next one to come back. `id` is now
--     frozen table-wide too. (On bell rows it was already covered by `new := old`.)
--
-- ── EVERY COLUMN, CLASSIFIED (11 of 11 — completeness demonstrated, not assumed) ──
--   id           → FROZEN on every row. A post's identity is fixed at creation; nothing
--                  legitimately re-keys a row.
--   post_type    → FROZEN on every row (BLOCK #4). What kind of event a post is, is fixed at
--                  creation; bell_ringing asserts a funded close.
--   rep_id       → FROZEN on every row (BLOCK #4). Attribution is fixed at creation;
--                  otherwise an exec could silently re-attribute any post, including a bell.
--   created_at   → FROZEN on every row, and forced to now() on INSERT. No post is backdatable
--                  (Trace's decision — table-wide, not bells-only).
--   reviewed_by  → TRIGGER-OWNED on every row. NULL on insert; auth.uid() on a genuine status
--                  transition; preserved otherwise. Never client-set (BLOCK #2).
--   reviewed_at  → TRIGGER-OWNED on every row. Same rules as reviewed_by (BLOCK #2).
--   title        → FROZEN on bell rows (BLOCK #5). Client-mutable on non-bell rows: an
--                  executive may copy-edit an announcement/win/materials/training/competitive
--                  post they or a rep authored.
--   body         → FROZEN on bell rows (BLOCK #5). Client-mutable on non-bell rows, as title.
--   territory_id → FROZEN on bell rows (BLOCK #5) — it names WHICH close is being celebrated;
--                  re-pointing it fabricates a different funded event. Client-mutable on
--                  non-bell rows (it is only ever an optional reference there).
--   status       → CLIENT-MUTABLE, on bells and non-bells alike, but ONLY via the executive
--                  review UPDATE policy (published|rejected, one-way; no rep UPDATE policy
--                  exists). This is how a bad bell gets rejected — the moderation surface.
--   pinned       → CLIENT-MUTABLE, on bells and non-bells alike, by an executive. This is how
--                  a real bell gets highlighted — the other half of the moderation surface.
--
-- Scope: this function ONLY. No RLS policy is touched. The trigger is already registered
-- BEFORE INSERT OR UPDATE (20260714190000) — no re-registration. No grant, column, or index
-- change: the get_advisors surface is unchanged. Superseded via CREATE OR REPLACE; every
-- prior migration in this chain is applied live and is NOT edited (supersede-never-delete).
--
-- NOTE (unchanged from #4, restated): a trigger fires for EVERY writer, service_role and
-- postgres included. These freezes therefore bind server-side code too. Intended.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.stamp_community_board_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  keep_status text;     -- status is TEXT, not boolean (the brief's sketch had this wrong)
  keep_pinned boolean;
begin
  if TG_OP = 'INSERT' then
    -- A new row has by definition not been reviewed — rep pending submission, executive
    -- direct-publish, and trigger-written bell alike. And no row is ever created backdated.
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.created_at  := now();
  else
    -- Immutable on EVERY row, of every post_type, through any verb.
    new.id         := old.id;
    new.created_at := old.created_at;
    new.post_type  := old.post_type;
    new.rep_id     := old.rep_id;

    if old.post_type = 'bell_ringing' then
      -- A bell asserts a real funded close. DENY BY DEFAULT: reset the entire row to its
      -- stored value, then re-apply ONLY the two fields moderation legitimately needs.
      -- Deliberately NOT a list of columns to freeze — that is what failed four times. A
      -- column added to this table in future is frozen here automatically.
      keep_status := new.status;
      keep_pinned := new.pinned;
      new := old;
      new.status := keep_status;
      new.pinned := keep_pinned;
    end if;

    -- Audit stamping runs AFTER the bell reset, and sets these two explicitly either way,
    -- so `new := old` above cannot resurrect a stale audit value.
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
  'BEFORE INSERT OR UPDATE on community_board_posts (E-2). Enforces the content invariants '
  'this table depends on, and does so DENY-BY-DEFAULT rather than by enumerating columns. '
  'INVARIANT: a bell''s content is authored solely by the close trigger — no client may alter '
  'any part of what a bell asserts, through any verb. On a bell row the ONLY client-mutable '
  'fields are status (reject a bad bell) and pinned (highlight a real one); everything else is '
  'reset to its stored value by `new := old`, so a column added to this table in future is '
  'frozen on bells AUTOMATICALLY instead of silently inheriting the hole. '
  'ALWAYS IMMUTABLE, every row and type: id, created_at, post_type, rep_id. created_at is also '
  'forced to now() on INSERT — no post is backdatable. '
  'TRIGGER-OWNED, every row: reviewed_by / reviewed_at — NULL on insert; auth.uid()/now() on a '
  'genuine status transition; preserved on a pin or copy-edit. Never client-set. '
  'CLIENT-MUTABLE on NON-bell rows only: title, body, territory_id (an executive may copy-edit '
  'an announcement/win/materials/training/competitive post). '
  'Closes five Second-Opinion Gate BLOCKs on PR #130 — the last of which (a genuine bell '
  'rewritten into a fabricated $1.2M close for a different territory, backdated to 2020) is why '
  'this is deny-by-default and not another column list. '
  'SECURITY INVOKER by design — it must see the CALLING executive''s uid. TG_OP=''INSERT'' is '
  'checked FIRST: OLD is unassigned on INSERT, so any OLD reference would error. '
  'A trigger rather than an RLS WITH CHECK because only a trigger sees OLD and NEW together — '
  'WITH CHECK cannot say "you may not CHANGE this column", and banning post_type=bell_ringing '
  'in the resulting row would also block an executive from rejecting a genuine bell. '
  'NOTE: fires for EVERY writer, service_role and postgres included — these freezes bind '
  'server-side code too. Intended.';

-- Explicit-grant discipline, restated: a function inherits the default PUBLIC EXECUTE grant,
-- which PostgREST would expose as a callable RPC. Trigger invocation does NOT check EXECUTE,
-- so revoking ALL closes that surface with zero effect on firing. Never granted back.
revoke all on function public.stamp_community_board_review() from public, anon, authenticated;
