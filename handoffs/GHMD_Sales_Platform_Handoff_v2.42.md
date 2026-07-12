# GHMD Sales Platform — Handoff v2.42

Date: 2026-07-12 | Prepared by: Coder at session close (docs/AGENTS.md session-close rule) |
Purpose: close out PR #114 (territory creation + TopBar search/quick-add + Prospects redesign).
v2.41 framed the migration apply and decision-log writes as *pending*; they are now *done*.
This handoff reflects completed state. Supersedes v2.41.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and
> security-advisor status are derived live at every session start (git, `ops.decision_log`,
> `get_advisors`). This handoff carries narrative only — the values below are as-of-session.

## State as of this handoff (as-of-session — verify live next session)

- **Main HEAD: `5435b60`** — PR #114 squash-merged (`5435b60a11e74eca8ec708a9ffdcb2e1864be65d`,
  parent `b4ddc5a`). This handoff PR (`chore/handoff-v2.42`) is the only thing after it.
- **Decision-log tip: #145** (rows #143, #144, #145 landed this cycle — Chat, via Supabase MCP,
  the sole sanctioned writer).
- **`get_advisors` (security): standing set only, no new findings** post-migration.
  `territory_status_map` still shows its pre-existing SECURITY-DEFINER-callable-by-authenticated
  WARN — unchanged by this migration, not a regression.
- **Open PRs: this handoff (`chore/handoff-v2.42`).**

## What shipped and was verified this cycle

### 1. PR #114 — MERGED (`5435b60`)

Implemented `BRIEF-territory-creation-and-topbar-actions.md`:
- **Territory creation** — exec-gated `POST /api/territories` (inserts `status='draft'`),
  `/territories/new` page (non-execs redirect) + `NewTerritoryForm`, "New Territory" list button.
  A draft resolves to `PENDING_REVIEW` and reuses the **unmodified** `V3SizingPanel` (sizes by
  `territoryId`, so sold-clip §8.4 applies).
- **Geocoding** — server-side `GET /api/geocode` (Mapbox v6, `MAPBOX_SERVER_TOKEN`) + manual
  lat/lng fallback (blank-field guard so an empty input can't resolve to 0).
- **TopBar** — global search wired (prospects + territories `ilike` under existing RLS, no
  widening) + global quick-add (New Prospect all; New Territory exec-only); `designation`
  prop-drilled layout→AppShell→TopBar.
- **Prospects list** — regrouped by `deal_status` (active/stalled/lost), excludes `archived`,
  "Show more" pagination (no `.limit(50)` cliff), tokenized.
- **Migration `20260711160000`** — `territory_status_map()` excludes `status='draft'`.

Review path: self-review → verification-before-completion → CI green → Chat independent diff
verification → Second-Opinion Gate → **ultrareview** (code-review-plugin ultra, multi-agent
adversarial). Two real bugs found and fixed pre-merge (`fd32a1b`): the `Number()` coercion trap
in `api/territories/route.ts` (now `parseApiCoordinate()`), and the stale-center bug in
`NewTerritoryForm.tsx` (clears `center` on every new search). One reviewer false-positive on
prospects RLS was correctly rejected after tracing the actual current policy (exec_all +
rep_read_own; see [[qualification-gate-build]]).

### 2. Deploy-preview QA + adversarial pass — COMPLETED (all pass)

Run via `chrome-devtools-mcp` against Trace's authenticated exec session on the #114 preview,
with direct evidence (network responses, DOM snapshots, RPC bodies) — not narration:
- **Part A** (auth-bypass sanity): `/dashboard` renders, no redirect. Pass.
- **B1** create-via-address-search → `PENDING_REVIEW` + `V3SizingPanel`; **B2** stale-center fix
  holds live (2nd search clears center, re-disables Create); **B3** TopBar search returns real
  prospect + territory hits and navigates; **B4** quick-add gating (exec sees both; non-exec sees
  only New Prospect); **B5** Prospects grouped Active/Stalled/Lost, 54 rows in Active alone (old
  50-cliff gone). All pass.
- **C1** non-exec blocked both client-side (redirect) and **server-side (403)** on
  `POST /api/territories`; **C2** garbage coordinates (`null`/`""`/`"abc"`/`[]`) rejected **400**
  server-side, no `(0,0)` row. Both pass.
- **C3** draft hidden from national map: confirmed **expected pre-migration state** during QA
  (draft `f0404c01` showed `status:"available"` in the RPC, 67 rows), then confirmed **resolved**
  after the migration applied (below).
- Env note (not a #114 defect): Mapbox tiles + Isochrone API 403 on the preview because
  `NEXT_PUBLIC_MAPBOX_TOKEN` is referer-restricted to the prod domain, not the `deploy-preview-*`
  subdomain. Pre-existing env config; blocks a full size→approve compute cycle on preview only.

### 3. Migration applied to live Sales DB — DONE + verified

`20260711160000_territory_status_map_exclude_draft.sql` applied to `cprltmwwldbxcsunsafl` via
Supabase MCP. Verified two ways: (1) `pg_get_functiondef` read-back confirmed the deployed body
contains `where t.status is distinct from 'draft'` with the `boundary_geojson` leak-fix branch,
`SECURITY DEFINER`, and `search_path` all preserved byte-for-byte; (2) direct `territories` query
confirmed **67 total, 1 draft (`f0404c01`), 66 would now surface** — the predicted 67→66 drop.
(Note: calling `territory_status_map()` from a raw SQL client returns 0 rows because `auth.uid()`
is null outside a PostgREST session — expected, not a defect.) `get_advisors` re-run: clean.

### 4. Decision log — #143 / #144 / #145 (Chat-written)

- **#143** (ADOPTED, `related_pr=114`, `residual_risk=none`) — the PR #114 build, ultrareview
  outcome, Chat's independent diff verification.
- **#144** (ADOPTED, unbound — #143 holds the PR-114 binding slot, `residual_risk=none`) — the
  migration apply + live-data verification.
- **#145** (CONFIRMED, unbound, `residual_risk=none`) — #142 validated in practice by live QA
  (address-search creation → `PENDING_REVIEW` → `V3SizingPanel` renders).

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| Territory creation + TopBar search/quick-add + Prospects redesign | — | **SHIPPED** (PR #114, `5435b60`); migration applied + QA-verified |
| Legacy ArcGIS sold-territory import (#141) | Trace | Deferred — blocked on Trace's ArcGIS data-cleanup pass, not started |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, per #136/#137) | **Still live in production, by explicit ongoing decision** — not a lapsed cleanup item |
| Demo/test data cleanup (#128) | future Coder | Untouched. **Now includes concrete row `f0404c01`** ("QA114 — Cherry Creek Denver", live draft left in place to support migration verification) — delete at go-live |
| `docs/SALES-OS-SPEC.md` §4B / National Map amendment (#122) | Trace | Untouched, not urgent |
| Session E; Platform RBAC | Trace authorization | Unopened |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Paused externally, unchanged |
| `prospects/new/page.tsx` raw-Tailwind styling | future Coder | Real, tracked, out of scope for #114 (only the list page was tokenized) |

## Note on `AUTH_GATE_DISABLED`

Per Trace's explicit correction: this is **not** a lapsed residual risk to re-flag as forgotten
— it was a deliberate decision (#136/#137) to stop it blocking build momentum, made knowingly.
It remains live in production. Continue noting it in every go-live-readiness session, but do not
frame it as an oversight.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
