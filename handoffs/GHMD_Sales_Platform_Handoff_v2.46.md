# GHMD Sales Platform — Handoff v2.46

Date: 2026-07-14 | Prepared by: Chat, relayed via Coder brief | Purpose: close out PR #124
(E-0a Platform RBAC Core, decision #150 → #157) including both Second-Opinion Gate BLOCK
fixes shipped within it; update the queue. Supersedes v2.45.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and
> security-advisor status are derived live at every session start (git, `ops.decision_log`,
> `get_advisors`). This handoff carries narrative only — the values below are as-of-session.

## State as of this handoff (as-of-session — verify live next session)

- **Main HEAD: `3e2c1d7`** — PR #124 squash-merged, parent `aab4ca1`. This handoff PR is the
  only thing after it.
- **Decision-log tip: #157.** #150 authorized E-0a/E-0b; #157 is the completion entry for
  E-0a, folding in both gate-fix rounds as delivered state, not footnotes. (Note: insert
  #156 failed on a schema NOT NULL violation — `decided_on`/`title`/`decision` — and was
  never written; #157 is the actual row. Harmless append-only gap, not a missing entry.)
- **`get_advisors` (security): standing set only, unchanged across both PR #124 rounds and
  post-merge.** Confirm fresh at next session start regardless.
- **Open PRs: none** (this handoff excepted).

## What shipped this cycle

### PR #124 — MERGED (`3e2c1d7`) — E-0a Platform RBAC Core (ultrareview, decision #150 → #157)

Session E's rep-identity prerequisite. Delivered in three rounds within the same PR — the
Second-Opinion Gate caught two real, distinct issues, both sent back and fixed rather than
accepted as residual risk:

**Round 1 (base delivery):**
- `internal_users.full_name` column (nullable) + idempotent designation-CHECK guard
  (migration `20260713150000_e0a_platform_rbac_core`).
- Confirmed (did not rebuild) existing `prospects` rep-siloing RLS from PR #92 —
  `exec_all` (ALL) + `rep_read_own` (SELECT) were already present and correctly isolated.
- Wired `assigned_rep_id` on prospect creation (initially to the creator's uid — corrected
  in round 3, see below).
- "Rep provisioning" manual procedure documented in `CLAUDE.md`.

**Round 2 — Gate BLOCK #1 fixed:** `rep_read_own` authorized on `assigned_rep_id = auth.uid()`
alone, with no check that the caller held an `internal_users` row with `designation='rep'` —
any authenticated principal whose uid happened to match could read the prospect. Hardened via
`ALTER POLICY` adding the `designation='rep'` EXISTS guard (migration
`20260713163000_harden_rep_read_own_designation`). Chat independently verified live:
pre-fix ghost-read=1 (a no-`internal_users`-row principal could read), post-fix=0; rep
isolation, exec access, and unauthenticated behavior all unchanged; `get_advisors` unchanged.

**Round 3 — Gate BLOCK #2 fixed:** `prospects/new` stamped `assigned_rep_id` with the
*creating exec's* uid — since prospect creation is exec-gated at the RLS INSERT layer (only
`exec_all` matches INSERT), every prospect created through the form was permanently invisible
to any rep under the now-hardened `rep_read_own`. The "wiring" from round 1 was a functional
no-op for its stated purpose. Fixed by removing creator-stamping entirely and adding a
required "Assign to" rep-selector, fed by a new executive-gated route
(`GET /api/internal-users/reps` — code-level gate mirroring `/api/territory-scouting/reports*`,
service-role read since `internal_users` has no SELECT policy beyond `self_read`, returns
`designation='rep'` rows only, never executives). Chat independently verified live: selected
value confirmed to be the chosen rep's uid (not the creator's), that rep can read the resulting
prospect via the hardened `rep_read_own`, exec access unaffected, `get_advisors` unchanged.

**Both fixes independently verified by Chat before merge** — live `pg_policies` text, the
actual route/page source (not Coder's self-report), and GitHub's `get_check_runs` API directly
(not comment-parsing) confirmed the gate's final state was a genuine `success`, not a
transient `gpt-unavailable` misread as a pass. One transient `gpt-unavailable` did occur on a
re-run; Coder correctly identified it as infra flake (not a finding) and re-ran once, per gate
protocol.

**Tier: ultrareview, correctly** — auth/RLS/roles, plus a new executive-gated data route.

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| Territory Scouting full build | — | **SHIPPED** (PR #120, `665c1dd`; decision #146 → #149) |
| QA-exec account + preview-only hostname guard + `.env.local` loading | — | **SHIPPED** (PR #121/#122; decision #148) |
| E-0a Platform RBAC Core (rep identity + siloing + attribution fix) | — | **SHIPPED this cycle** (PR #124, `3e2c1d7`; decision #150 → #157). Includes both gate-fix rounds as delivered state. |
| Dashboard service-role RLS bypass (`src/lib/dashboard/data.ts`) | future Coder | **Flagged, not fixed.** A rep's dashboard stage-counts/feed/hot-leads currently reflect *all* prospects, not just their own — the service-role client needed for `proposal_*` telemetry bypasses `prospects` RLS. Own scoped change. |
| No rep INSERT policy | future Coder | **Flagged, not fixed.** Reps still cannot self-create prospects — write-scope deferral from the original qualification-gate work, reaffirmed in scope during E-0a. |
| No DB-level validation that `assigned_rep_id` points to a `designation='rep'` row | future Coder, low priority | Enforced at the UI layer only (required selector). RLS visibility is independently correct regardless (gated by `rep_read_own`'s designation check), so this is a data-hygiene gap, not a security gap. |
| Rep provisioning | Trace | **Zero reps currently exist** (`internal_users` = 2 rows, both executive). Prospect creation via `/prospects/new` is now operationally blocked until at least one rep is provisioned — intentional consequence of the E-0a fix (a required selector beats a silent null default), not a bug. See CLAUDE.md "Rep provisioning." |
| E-0b (Deal Territories rework) | Coder, next | **Ready to send** — brief fully written, unchanged, per decision #150's explicit sequencing (depends on E-0a merging first — now satisfied). |
| Session E modules proper (Scoreboard, Bell Ringing, Community Board, Resource Library, Template Gallery, Events) | Trace authorization | Not started — E-0a/E-0b are the RBAC prerequisite only. |
| TopBar global search — nullable-status exposure | future Coder | Flagged, unchanged from prior handoffs. |
| Legacy ArcGIS sold-territory import (#141) | Trace | Deferred, blocked on Trace's data-cleanup pass. |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, #136/#137) | Still live by explicit ongoing decision. |
| Demo/test data cleanup (#128) | future Coder | Untouched. Includes `f0404c01` (draft territory) and the two AC11 QA rows from #120's walkthrough (`territory_scouting_reports.id = 3c1cd828...`, `territory_sizing_jobs.id = bcc3a4cf...`). |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Paused externally, unchanged. |

## Note on `AUTH_GATE_DISABLED`

Unchanged: deliberate, ongoing decision (#136/#137), not a lapsed oversight. Still live in
production. Continue noting it every go-live-readiness session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
