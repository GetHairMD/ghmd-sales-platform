-- ─────────────────────────────────────────────────────────────────────────────
-- Harden prospects.rep_read_own — require caller to actually be a rep.
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl).
-- NIP (GetHairMD Network, kjweckggegifjmmqccul) is never touched.
--
-- Decision log: #150 (Platform RBAC). Second-Opinion Gate escalation on PR #124
-- (GPT-5 adversarial review, VERDICT: BLOCK), sent back by Trace for fix.
--
-- FINDING: rep_read_own (shipped with the qualification-gate work, PR #92) had
--   USING (assigned_rep_id = (select auth.uid()))
-- which authorizes on UID-match ALONE. It never confirms the caller is a rep, so
-- ANY authenticated principal — including one with no internal_users row at all —
-- could SELECT a prospect whose assigned_rep_id happened to equal its uid. Proven
-- live pre-fix (a no-internal_users "ghost" uid saw the row). Low-exploitability
-- today (prospect creation is exec-gated, so assigned_rep_id only ever holds an
-- exec/rep uid) but not fail-closed, and Session E broadens the authenticated set.
--
-- FIX: add the designation='rep' membership check to the USING clause, mirroring
-- the exec_all idiom (inline EXISTS on internal_users, (select auth.uid()) wrap).
-- exec_all is untouched — execs keep full access via that separate FOR ALL policy.
--
-- Both `supabase db push` and MCP apply_migration wrap each migration in a
-- transaction automatically.
-- ─────────────────────────────────────────────────────────────────────────────

alter policy rep_read_own on public.prospects
  using (
    assigned_rep_id = (select auth.uid())
    and exists (
      select 1 from public.internal_users iu
      where iu.user_id = (select auth.uid())
        and iu.designation = 'rep'
    )
  );
