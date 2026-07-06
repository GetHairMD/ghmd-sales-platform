# GHMD Sales Platform — Handoff v2.31

Date: 2026-07-06 | Prepared by: Chat | Purpose: Post-v3-sizing-engine-merge bump — supersedes v2.30.

Main has moved from `36b7c7f` to `be36525` (PR #75 merged) and the decision log has moved from tip #86 to tip #90 since v2.30.

## Current State — Exact Snapshot

| Item | State |
|------|-------|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase | `cprltmwwldbxcsunsafl` (NIP `kjweckggegifjmmqccul` — never touch) |
| Netlify | ghmdsalesplatform.netlify.app (main auto-deploys) |
| main | **`be36525`** (PR #75 merged, squash) |
| Branch protection | main requires the `gate` status check (Second-Opinion Gate LIVE) |
| Active branch | none — main is clean, no open feature branch |
| Governing docs | `docs/AGENTS.md` · `docs/SALES-OS-SPEC.md` · `docs/TERRITORY-METHODOLOGY.md` · `docs/V3-DRIVE-TIME-SCOPING.md` (all fetched live each session — none stale) |
| Decision log tip | **#90** (see below for full sequence since v2.30) |
| Decision mirror | `/decisions/DECISION_LOG.md` — **STALE, behind #78**; regen still blocked (see Deferred) |

## Decision sequence since v2.30 (tip #86 → #90)

| # | What | Note |
|---|------|------|
| #86 | `/proposals` index shipped (PR #74) | Carried in v2.30 |
| **#87** | — | **Gap, same pattern as #81/#83.** Failed insert (unique constraint violation on `(related_repo, related_pr)` — attempted to attach a new entry to PR #74, already claimed by #86) consumed a sequence value before the corrected insert (with `related_pr`/`related_repo` both null) succeeded. Append-only means nothing was touched or deleted. **Three gaps now on record (#81, #83, #87), all the same failure mode** — worth a Coder look at whether the insert-retry pattern in the sanctioned-writer flow could avoid consuming a sequence value on a predictable constraint violation, though this is cosmetic, not a data-integrity issue. |
| #88 | Mobile bottom-tab count flagged as an open product question (side effect of PR #74) — not yet decided | PR #74's nav change auto-derived a 5th mobile bottom tab (`BOTTOM_TABS` includes any nav item with an `href`). Benign layout-wise (flex-1, no overflow), desktop/demo path unaffected, but genuinely undecided as IA: is 5 tabs intended, or should Proposals be excluded from `BOTTOM_TABS` and stay desktop/sidebar-only? **Unresolved, owner Trace** — natural to resolve alongside the 390px mobile QA sweep below, same live look at the mobile shell. |
| #89 | v3 drive-time build — all 8 scoping flags resolved (`docs/V3-DRIVE-TIME-SCOPING.md` §9); build session cleared to open | Trace resolved all 8 flags in one pass: PostGIS approved; Mapbox server token to be scaffolded (not provisioned) by Coder; population-weighted apportionment; population-weighted multi-state credit blend; `denoise=1.0` default accepted; `deals.signed_at` as sold-precedence key; unresolved-at-ceiling economics out of scope; two-ring→single-ring display confirmed conceptually (UI change itself deferred). Cleared the path for an unattended cloud-session build with zero open product decisions embedded. |
| #90 | v3 drive-time territory sizing engine merged (PR #75, squash SHA `be36525`) — backend only, no UI wiring | See "What shipped" below. |

## What shipped since v2.30

| Item | PR | Result |
|---|---|---|
| **v3 drive-time territory sizing engine (backend only)** | #75 | Built and merged in a single unattended cloud session (Trace traveling with intermittent connectivity; session survived one mid-session connection drop and resumed cleanly with no lost work). Two increments on one branch (cloud-session policy pinned all work to a single branch), landed as two commits: **PR-A** (`8371469`) — migration `20260706120000_v3_drive_time_boundary.sql` (`CREATE EXTENSION postgis`; `territories` gains `formula_version` default `2` — all 3 existing rows confirmed unchanged — plus `boundary_geom`/`boundary_geojson`/`boundary_minutes`/`boundary_source`/`sold_boundary_geom` with GiST indexes, no new RLS policy), v3 constants added additively (`V3_VIABILITY_BUFFER=1.5`, `V3_MIN_VIABLE_CUSTOMERS=93`, `V3_MIN_ADDRESSABLE_FLOOR=18600`, `V3_MAX_DRIVE_MINUTES=45`), `MAPBOX_SERVER_TOKEN` scaffolded (value not set). **PR-B** (`9e6a9f8`) — `geometry.ts` (point-in-polygon/sold-clip predicates), `polygon-apportionment.ts` (`fetchB19001ForPolygon`, household-weighted block-level dasymetric apportionment per resolved flag #3), `credit-share.ts` (`blendCreditShareByHouseholds`, multi-state household-weighted blend per resolved flag #4), `territory-sizing-v3.ts` (`sizeByExpansion` — coarse probe → binary refine → 45-min ceiling → typed `UNRESOLVED_BELOW_THRESHOLD_AT_CEILING`, never a fake 45-min boundary), `isochrone.ts` (server-side Mapbox fetch, `denoise=1.0`), `POST /api/territories/size` (auth-gated, compute-only, no writes to `territories`), `census-tiger.ts` (TIGERweb/ACS adapter; live network path is a follow-on spike, not CI-run). Verification (independently confirmed by Chat, not taken on Coder's report alone): both `gate` governance-check runs green, `be36525` confirmed as HEAD of main, tests reported 825→885 (+60) by Coder — consistent with green CI and diff shape but not independently re-run by Chat. |

## New security advisor findings from this session — folded into the standing item, Hard Rule 10 unaffected

Enabling PostGIS (decision #89 flag 1, executed in PR #75) introduced new findings, all independently verified by Chat via `get_advisors` before logging #90:

- **ERROR** `rls_disabled_in_public` on `public.spatial_ref_sys` — PostGIS's own SRID reference table. Standard, unavoidable consequence of the extension. Not remediated — RLS changes are owned by the standing always-true-RLS item, explicitly out of this session's scope.
- **WARN** `extension_in_public` — `postgis` installed in `public` schema (Supabase default).
- **WARN** `anon_security_definer_function_executable` / `authenticated_security_definer_function_executable` on `st_estimatedextent` (3 overloads) — a function bundled with PostGIS itself, not written by Coder. Same benign category as the above two; a read-only estimate function, not a real access-control gap.

**Separately noticed, not caused by this PR** (neither PR-75 commit touches `proposals`/`proposal_events`/`proposal_sessions`): those three tables now show `rls_enabled_no_policy` at INFO level, expanding the previously-tracked no-policy set beyond the 4 `operator_*` tables. Not a new regression — just newly itemized in this session's advisor re-check. Carried forward as a disposition update.

**Hard Rule 10 continues to block any live prospect send** regardless of any finding above — nothing here changes that gate, and nothing here is urgent on its own.

## The 2026-07-06 demo — resolved, no follow-up needed

Per v2.30, the demo outcome was unknown at that handoff's authorship. **This has since been superseded by events** — the same-day session moved straight into the v3 build track without any reported demo-fix requests, so treat the demo as closed unless Trace raises something retroactively.

## Standing deferrals — carried forward, none resolved

| Item | Owner | Notes |
|---|---|---|
| **390px mobile visual QA** — `/dashboard`, `/proposals`, generator panel | Pilot, on deploy-preview | Never done across three sessions now. Natural pairing with resolving #88 (mobile bottom-tab count) in the same live look. |
| **Functional global search** (TopBar) | future Coder session | Dead field by design — needs a full brief before wiring. |
| **Repo-wide token-lint broadening** | future Coder session | Lint rule scoped only to `src/components/proposal/**` and `src/app/p/**`. `/prospects` and `/` (root) still have raw Tailwind utilities. |
| `log:export` DECISION_LOG.md mirror regen | Coder, needs service-role env | Still blocked from Session D; now #78–#90 all missing from the mirror. |
| Calendly Phase 1 provisioning | **Trace, manual, off-transcript** | Unchanged. |
| Resend provisioning | **Trace, manual, off-transcript** | Unchanged — blocks live trigger emails. |
| Proposal generator send-copy claims review | Trace / Rick Dahlson | Unchanged — blocks any real prospect send. |
| `hausauerghmd` clone retirement | Trace | Unchanged — parity-confirmed safer, not retired. |
| **`census-tiger.ts` live path** | Trace (provisioning) then Coder (smoke test) | Needs `CENSUS_API_KEY` + `MAPBOX_SERVER_TOKEN` provisioned before a live smoke test can run; not guessed at, correctly flagged rather than faked. |

## v3 drive-time — what's left after PR #75

The backend sizing engine is merged. Two things remain, both explicitly out of scope for the PR #75 session:

1. **v3 QA anchor lock (§6)** — requires Trace live, at a screen, to pick 2–3 reference practice locations (the existing 3 `territories` rows are natural candidates), review real computed numbers from the new engine, and sign off before they're locked as regression fixtures via a dedicated decision-log entry. **This is the one piece of v3 that could not run unattended** and is the natural next step now that Trace is back at a screen.
2. **UI wiring** — territory authoring flow, proposal map, and the two-ring → single-ring display change (flag #8, conceptually confirmed in #89 but not yet built). Separate, larger-scope follow-on session.

## Decision needed next session

1. **Pick the next track** — v3 QA anchor lock (best fit now that Trace is at a screen), v3 UI wiring (bigger scope), 390px mobile QA (paired with #88), provisioning punch-list, or Session E (still unopened, still needs explicit authorization).

**Do not assume — ask or wait for direction**, same as every prior handoff.

## Security Advisor Status (confirmed fresh this session, independently re-run — not carried blindly from v2.30)

7 always-true RLS policies (`activities`, `call_scores`, `deals`, `outreach_touches`, `prospects`, `spoke_candidates`, `territories`) — unchanged. 7 no-policy tables at INFO (`operator_enrichment`, `operator_score_records`, `operator_scores`, `operators`, `proposal_events`, `proposal_sessions`, `proposals` — the last three newly itemized this session, not new regressions). `gate_decision_for_pr` and `rls_auto_enable` anon/authenticated SECURITY DEFINER exposure — unchanged, both previously dispositioned (intentional / confirmed false-positive respectively). **New this session, from PostGIS enablement:** `spatial_ref_sys` RLS-disabled ERROR, `postgis` extension-in-public WARN, `st_estimatedextent` (3 overloads) anon/authenticated SECURITY DEFINER WARN — all standard, unavoidable PostGIS-on-Supabase artifacts, not remediated, folded into the standing item. Hard Rule 10 continues to block any live prospect send regardless of feature progress.

## Not This Session (escalate, don't creep)

Session E and v3 UI wiring remain unopened — explicit Trace authorization required for either.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer** |
| Coder | git + schema + code + migrations (fresh context each session) |
| Pilot | GitHub UI + browser tasks (incl. deploy-preview visual QA) |
