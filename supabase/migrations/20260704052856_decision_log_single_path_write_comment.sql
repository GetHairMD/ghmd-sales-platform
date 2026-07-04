-- ─────────────────────────────────────────────────────────────────────────────
-- ops.decision_log — correct write-convention comment to SINGLE-PATH (Chat only)
--
-- Supabase project: ghmd-sales-platform (cprltmwwldbxcsunsafl). NIP never touched.
-- Applied to prod via MCP as version 20260704052856 (2026-07-04). Comment-only —
-- no structure/RLS change.
--
-- Supersedes the two-path text set by version 20260701223444. The write policy is
-- now one sanctioned path (Trace-directed Chat via the Supabase MCP connector);
-- neither Coder nor any subagent writes to this table (decision #57 / PR #58).
-- Brings the live table comment in line with CLAUDE.md + the ghmd-orchestration
-- contract as amended in #58.
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE ops.decision_log IS 'GHMD Sales Platform decision log — compliance spine. Append-only: rows are never updated or deleted (supersede, never delete); a superseded decision is retained and linked to its replacement via superseded_by. One sanctioned write path: Trace-directed Claude Chat sessions via the Supabase MCP connector, at phase close. Neither Coder nor any subagent writes to this table under any circumstance — they report entry content and the squash SHA to Chat for the write (decision #57 / PR #58, 2026-07-03). RLS posture unchanged: service_role only.';
