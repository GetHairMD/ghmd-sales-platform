-- ─────────────────────────────────────────────────────────────────────────────
-- Qualification Gate PR3 — rep-writable notes surface (qualification_review_notes)
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Governing doc: docs/QUALIFICATION-GATE-SCOPING.md §5/§6. Decisions #109/#110.
-- Brief: PR3 §2 ("the real design problem in this PR").
--
-- WHY A SEPARATE TABLE (not a column-level GRANT on qualification_reviews.notes):
--   PR1 deliberately left reps SELECT-only on qualification_reviews and flagged the
--   rep note-write path as "a deliberate PR3 design, not a side effect." RLS is
--   ROW-level, not column-level: a rep UPDATE policy on qualification_reviews would
--   also let them overwrite recommendation / reviewed_by / reviewed_at / ai_summary
--   (the exec-issued gate signal + provenance). The alternative — Postgres
--   column-level privileges (revoke update … from authenticated; grant update(notes))
--   — is unusable cleanly here because reps AND execs share the single `authenticated`
--   role (the exec/rep split is a value in internal_users.designation, NOT a Postgres
--   role), so revoking column UPDATE from authenticated would also block execs from
--   issuing `recommendation` via the normal RLS path, and column-privileges appear
--   nowhere else in this schema. Trace-confirmed 2026-07-09: use a dedicated
--   rep-writable table instead.
--
-- RESULT: qualification_reviews keeps PR1's policies UNCHANGED — reps have NO write
--   policy there, so the exec-issued columns are structurally unwritable by reps
--   (guarantee by absence-of-grant, not by a USING clause that could be widened).
--   Rep notes live here, keyed to the prospect, scoped by RLS to the assigned rep.
--   qualification_reviews.notes remains the EXEC's optional decision note (still
--   rep-readable via PR1's rep_read_own); rep notes are a distinct authored surface,
--   so the two never collide.
--
-- RLS MODEL (extends the #105/#86 internal_users EXISTS pattern; no new idiom):
--   exec-all:   internal_users.designation = 'executive'  → full access to all rows.
--   rep-own:    a rep may SELECT / INSERT / UPDATE (never DELETE) the note row for a
--               prospect they are the assigned_rep_id of, and only as themselves
--               (author_id = auth.uid()). No rep may touch another prospect's note.
--   anon:       revoked at the privilege layer too (matches PR1's tightened posture).
--
-- Server code uses the service_role for SSR/functions only where it must bypass RLS
-- (proposal_* reads); the qualification write paths run as the authenticated user so
-- these policies are the live boundary — `enable`, never `force`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. qualification_review_notes — the rep-writable note, keyed to prospects.id ─
-- One row per prospect (edit-in-place, mirroring qualification_reviews' unique
-- prospect_id; PR3 upserts on prospect_id). Cascades with the prospect, exactly like
-- the sibling qualification_* tables.
create table public.qualification_review_notes (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null unique references public.prospects(id) on delete cascade,
  author_id    uuid references auth.users(id),  -- the rep (or exec) who wrote it
  note         text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()  -- app-managed (repo has no updated_at trigger)
);
comment on table public.qualification_review_notes is
  'Rep-writable note on a prospect''s qualification review. Separate from qualification_reviews (exec-issued) so reps can write notes WITHOUT any write access to the exec-issued recommendation/reviewed_by/reviewed_at/ai_summary columns (RLS is row-level, not column-level — PR3 §2, Trace-confirmed 2026-07-09). Keyed to prospects.id, one row per prospect (edit-in-place). RLS: exec-all + rep-own (assigned_rep_id = auth.uid()).';
create index qualification_review_notes_prospect_id_idx on public.qualification_review_notes(prospect_id);

-- ── 2. RLS ──────────────────────────────────────────────────────────────────
alter table public.qualification_review_notes enable row level security;

-- anon is never a legitimate reader/writer of qualification data (matches PR1).
revoke all on public.qualification_review_notes from anon;

-- Exec: full access (same inline EXISTS shape + init-plan wrap as #105/#86/PR1).
create policy "exec_all" on public.qualification_review_notes
  for all to authenticated
  using      (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'))
  with check (exists (select 1 from public.internal_users iu where iu.user_id = (select auth.uid()) and iu.designation = 'executive'));

-- Rep: SELECT own-prospect note. (No exec designation required — being the prospect's
-- assigned_rep_id is the grant; execs are already covered by exec_all above.)
create policy "rep_select_own" on public.qualification_review_notes
  for select to authenticated
  using (exists (
    select 1 from public.prospects p
    where p.id = qualification_review_notes.prospect_id
      and p.assigned_rep_id = (select auth.uid())
  ));

-- Rep: INSERT a note for an own prospect, authored as themselves. The author_id
-- check stops a rep from attributing a note to another user.
create policy "rep_insert_own" on public.qualification_review_notes
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.prospects p
      where p.id = qualification_review_notes.prospect_id
        and p.assigned_rep_id = (select auth.uid())
    )
  );

-- Rep: UPDATE their own-prospect note in place, still only as themselves. No rep
-- DELETE policy — reps cannot remove the note (append/edit only).
create policy "rep_update_own" on public.qualification_review_notes
  for update to authenticated
  using (exists (
    select 1 from public.prospects p
    where p.id = qualification_review_notes.prospect_id
      and p.assigned_rep_id = (select auth.uid())
  ))
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.prospects p
      where p.id = qualification_review_notes.prospect_id
        and p.assigned_rep_id = (select auth.uid())
    )
  );
