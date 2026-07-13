# GHMD Sales Platform — Handoff v2.45

Date: 2026-07-13 | Prepared by: Chat, relayed via Coder brief | Purpose: close out PR #120
(Territory Scouting, decision #146) and record PR #121/#122 (QA-exec account + preview-only
guard); update the queue. Supersedes v2.44.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and
> security-advisor status are derived live at every session start (git, `ops.decision_log`,
> `get_advisors`). This handoff carries narrative only — the values below are as-of-session.

## State as of this handoff (as-of-session — verify live next session)

- **Main HEAD: `665c1dd`** — PR #120 squash-merged, parent `8064fa3`. This handoff PR
  (`chore/handoff-v2.45`) is the only thing after it.
- **Decision-log tip: #149.** PR #120 landed the completion entry for decision #146
  (Territory Scouting). PR #121/#122 landed under #148.
- **`get_advisors` (security): standing set only, re-confirmed post-merge.**
  `territory_scouting_reports` correctly does **not** appear — it ships with an exec-only RLS
  policy, so there is no `rls_enabled_no_policy` finding. Confirm fresh at next session start
  regardless.
- **Open PRs: none** (this handoff excepted).

## What shipped this cycle

### PR #120 — MERGED (`665c1dd`) — Territory Scouting (ultrareview, decision #146 → #149)

Full executive-only market-scouting build:

- **`territory_scouting_reports` table + exec-only RLS** (migration `20260712120000`) — applied
  to the live DB. Reports are exec-readable only, never rep-visible, never on the National Map,
  never promoted to a real territory in v1.
- **Three exec-gated routes** reusing the v3 drive-time engine via its **library functions**
  (`createSizingJob` / `triggerSizingJob` / `getSizingJob`), **not** by fetch-ing
  `/api/territories/size*` (those are auth-gated, not exec-gated — the wrong authorization
  surface): `POST`/`GET /api/territory-scouting/reports` and
  `GET /api/territory-scouting/reports/[reportId]`. The jobs table stays service-role-only, so
  the executive gate lives in code; the report row is written through the RLS-protected client
  as defense-in-depth.
- **`/territory-scouting` page** — page-level exec gate mirrors `/territories/new` (fail closed:
  `getViewerDesignation()` returns null on any auth hiccup → non-exec → `redirect('/dashboard')`).
  Composes the same v3 display primitives (`AddressableVsFloor` + `TerritoryBoundaryMap`) via a
  polling result panel; deliberately does **not** reuse `V3SizingPanel` (no territory-promotion
  concept in scouting).
- **`BOTTOM_TABS` exec-only leak fix** in `nav-items.ts` + `nav-visibility` test update.
- **`docs/SALES-OS-SPEC.md` §4B corrections** — added the missing **National Map** entry (live
  via #121/#122/#132 but never previously written into the spec) and rewrote the Territory
  Scouting item (its old description actually described what became the PR #114 New Territory flow).

**AC11 (exec-authenticated deploy-preview walkthrough) — CLOSED.** Exercised via the QA-exec
account and a **temporary Playwright driver that was never committed to any branch** (installed
`--no-save`, deleted after the run; sign-in routed through `preview-login.ts`'s
`preparePreviewLogin()` so credentials never entered the session as plaintext). Independently
verified against the live DB by Chat: `/territory-scouting` rendered for the exec (no
`/dashboard` redirect), a Denver run resolved **VIABLE at 22,296 addressable** (3,696 above the
18,600 floor), the drive-time boundary polygon + `AddressableVsFloor` rendered at both desktop
and 390px, the poll lifecycle halted cleanly after the terminal state (no runaway timer), and
the `requested_by` attribution was correct to the QA-exec UUID.

**Tier: ultrareview, correctly** — new table + RLS + exec-gated data routes + auth surface.

### PR #121 (`3fa38fe`) + PR #122 (`8064fa3`) — QA-exec account + preview-only guard (decision #148)

Provisioned a second executive identity used solely for deploy-preview QA
(`internal_users.designation = 'executive'`, auth UUID `fc262e14-6080-4187-9aa9-84092a556f5c`),
plus the load-bearing preview-only hostname guard `scripts/qa/preview-login.ts`
(`preparePreviewLogin()` asserts the target matches `deploy-preview-<PR#>--ghmdsalesplatform.netlify.app`
before credentials are ever read; production/branch-deploy/NIP/decoy hosts are refused). #122
added `.env.local` loading via `@next/env` so both the CLI preflight and importing QA drivers
pick up `QA_EXEC_EMAIL`/`QA_EXEC_PASSWORD` (Trace-held locally, never in Netlify, never echoed).

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| Territory creation + TopBar search/quick-add + Prospects redesign | — | **SHIPPED** (PR #114, `5435b60`) |
| Deal Territories draft-visibility fix | — | **SHIPPED** (PR #116, `a9e2adc`) |
| `prospects/new/page.tsx` raw-Tailwind tokenization | — | **SHIPPED** (PR #118, `b31c13e`) |
| Territory Scouting full build | — | **SHIPPED this cycle** (PR #120, `665c1dd`; decision #146 → completion #149). Exec-only `territory_scouting_reports` + RLS + exec-gated routes + `/territory-scouting` page + nav wiring + spec §4B corrections. AC11 exec-auth walkthrough closed (Chat-verified). |
| QA-exec account + preview-only hostname guard + `.env.local` loading | — | **SHIPPED** (PR #121 `3fa38fe` / #122 `8064fa3`; decision #148) |
| Session E / Platform RBAC | Trace authorization | **Still not yet authorized** — sequencing intent only ("then we move to Session E"), needs its own scoping pass before any build starts |
| TopBar global search — parallel nullable-status exposure | future Coder | **Flagged, not yet decided.** Same `IS DISTINCT FROM` trap as #116 if a draft filter is ever added there. Deliberately out of scope |
| Legacy ArcGIS sold-territory import (#141) | Trace | Deferred — blocked on Trace's ArcGIS data-cleanup pass, not started |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, per #136/#137) | **Still live in production, by explicit ongoing decision** — not a lapsed cleanup item (see note below) |
| Demo/test data cleanup (#128) | future Coder | Untouched. Includes concrete row `f0404c01` — delete at go-live. **Also folds in the two orphan QA rows from AC11's exec-auth walkthrough — `territory_scouting_reports.id = 3c1cd828-02e8-45f6-98fc-47013e105c25` and its `territory_sizing_jobs.id = bcc3a4cf-210a-406d-b1f8-d4f5a8dd3f4b` (label "AC11 QA — Denver (automated)"). Left in place by Trace's explicit decision; tracked here (not separately) so a future session doesn't rediscover them as an unexplained anomaly.** |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Paused externally, unchanged |

## Note on `AUTH_GATE_DISABLED`

Unchanged from v2.43/v2.44: this is a **deliberate, ongoing decision** (#136/#137), not a lapsed
oversight. Still live in production. Continue noting it every go-live-readiness session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
