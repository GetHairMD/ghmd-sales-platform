-- ─────────────────────────────────────────────────────────────────────────────
-- E-2 (Session E, module 2) — step 1 of 2: QA rep-seat provisioning (decision #161).
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (kjweckggegifjmmqccul) is never touched.
--
-- WHY this is a separate migration, applied BEFORE the RLS migration:
-- until today production had exactly TWO internal_users rows, both 'executive'
-- (verified live before writing this). Every rep-siloing policy shipped so far
-- (E-0a rep-designation RLS, E-0b territories rep_read, E-1 scoreboard) has only
-- ever been provable by adversarial JWT simulation — no real 'rep' seat existed to
-- sign in as. These two rows are what make E-2's AC4/5/7 (rep submits pending; rep
-- cannot read ANOTHER rep's pending; rep cannot approve) testable with two REAL,
-- distinct rep sessions rather than a simulated claim.
--
-- Per CLAUDE.md "Rep Provisioning (manual — E-0a, decision #150)": Trace created
-- both auth.users rows and set their passwords directly in the Supabase console.
-- No password has passed through this session; none is echoed, committed, or
-- referenced here. Coder inserts ONLY the internal_users row keyed by the auth UUID
-- Trace supplied. internal_users.user_id is an FK to auth.users, so the auth rows
-- must (and do) already exist — verified live:
--   de190bae-c56c-44dc-a3cc-6ff74f605d80  qa-rep-a@internal.gethairmd.test
--   9ea663c9-5179-4a02-b200-5c4763338e6e  qa-rep-b@internal.gethairmd.test
--
-- SCOPE WARNING (same class as the QA-exec, CLAUDE.md "QA / Deploy-Preview
-- Capability Stack"): ONE Supabase project backs BOTH production and every deploy
-- preview. These are therefore REAL rep seats on production, not preview-only
-- fixtures. Nothing at the DB layer confines them to a preview host — the only
-- thing that does is the hostname guard in scripts/qa/preview-login.ts, which is
-- load-bearing and must stay so. They hold no prospects and no territories, so a
-- rep-siloed RLS policy grants them visibility into nothing.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.internal_users (user_id, designation, full_name)
values
  ('de190bae-c56c-44dc-a3cc-6ff74f605d80', 'rep', 'QA Rep A'),
  ('9ea663c9-5179-4a02-b200-5c4763338e6e', 'rep', 'QA Rep B')
on conflict (user_id) do update
  set designation = excluded.designation,
      full_name   = excluded.full_name;

comment on table public.internal_users is
  'Allow-list of internal staff (Hard Rule 10 remediation, #86/#105). designation is '
  'CHECK-constrained to executive | rep. Provisioning is MANUAL and password-free from '
  'an agent''s perspective (CLAUDE.md Rep Provisioning, decision #150): Trace creates the '
  'auth.users row + password in the Supabase console, then supplies only the auth UUID. '
  'full_name is nullable — every UI surface rendering it must fall back to a generic '
  'label on NULL, never crash or print "null". As of decision #161 this table holds two '
  'executives (one of them the QA-exec) and two QA rep seats (QA Rep A / QA Rep B), which '
  'are real production seats, not preview-only fixtures.';
