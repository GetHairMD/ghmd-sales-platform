# GHMD Sales Platform — Handoff v2.31

Date: 2026-07-07 | Prepared by: Coder (docs-only PR, Chat-reviewed before merge) | Purpose: Post-async-sizing + v3-QA-anchor-lock bump — supersedes v2.30.

Main has moved from `be36525` (PR #75) to **`997fe41`** (PR #79 merged) and the decision log has moved from tip **#90** to tip **#94** since v2.30. v2.30 stopped at PR #75 / decision #90 and did not cover any of #77–#94 — this handoff closes that gap.

## Current State — Exact Snapshot

| Item | State |
|------|-------|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase | `cprltmwwldbxcsunsafl` (NIP `kjweckggegifjmmqccul` — never touch) |
| Netlify | ghmdsalesplatform.netlify.app (main auto-deploys) |
| main | **`997fe41`** (PR #79 merged, squash) |
| Branch protection | main requires the `gate` status check (Second-Opinion Gate LIVE) |
| Active branch | `chore/handoff-v2.31` (this docs PR); no open code branch |
| Governing docs | `docs/AGENTS.md` · `docs/SALES-OS-SPEC.md` · `docs/TERRITORY-METHODOLOGY.md` · `docs/V3-DRIVE-TIME-SCOPING.md` (all fetched live each session — none stale) |
| Decision log tip | **#94** (see below for full sequence since v2.30) |
| Decision mirror | `/decisions/DECISION_LOG.md` — **STALE, behind #78**; regen still blocked. Now **#78–#94 all missing** from the mirror (was #78–#90 at v2.30). |

## Decision sequence since v2.30 (tip #90 → #94)

| # | What | Note |
|---|------|------|
| #91 | **De-franchise platform identity** (PR #77, `f696228`) — CLAUDE.md Project Identity corrected from "GetHairMD **Franchise** Sales Platform … purpose-built for **franchise** prospect-to-close sales operations" to "GetHairMD Sales Platform … purpose-built for prospect-to-close sales operations." | `legal_flag: true`, `residual_risk: none`, status ADOPTED. Trace direction was explicit: "This is a Sales Platform only. Not for a franchise at all." A repo-wide case-insensitive `franchise` sweep ran before merge; only the CLAUDE.md Project Identity mislabel was an actual platform-identity error and was corrected. All other hits (SPRINT-STATE.md, `docs/AGENTS.md` "licensee != FDD trigger", and `src/lib/pipeline-stages.ts` comments/tests describing the retired pre-licensee franchise-era pipeline) were left untouched, each for a documented reason. |
| #92 | **PostGIS `spatial_ref_sys` RLS cannot be enabled — accepted, standing** | `residual_risk: accepted`, status ADOPTED, no `related_pr` (advisor-disposition decision, not a code change). Confirmed via Supabase dashboard error (Postgres `42501: must be owner of table spatial_ref_sys`) that the table is owned by the role that installed the PostGIS extension, not the project role — `ALTER TABLE` / RLS toggling is impossible without Supabase support or superuser intervention. The table holds only PostGIS SRID reference data (no prospect/territory/user content), so exposure risk is negligible regardless of RLS state. **This is now a standing, already-adjudicated finding** on every future `get_advisors` run — do not re-open it. |
| #93 | **v3 async sizing job model + GEOID census cache (the PR #78 504 fix itself)** (PR #78, `b2e2ab2`) | `residual_risk: accepted`, status ADOPTED. Adopts an async job model (POST enqueues + returns `202` + `jobId`; compute runs out-of-band in a Netlify Background Function; new poll route) combined with a GEOID-level census cache, precise polygon pre-clip, per-county batched fetch with bounded concurrency + retry/backoff, and a superset-once refactor of the candidate-minute expansion search. See "What shipped" below. |
| #94 | **v3 QA anchor lock — DONE** (no `related_pr`; anchors locked from real production runs, not a code change) | `residual_risk: unresolved` (isochrone-freeze gap — see below), status ADOPTED. Three v3 QA anchor territories locked at their 15-minute drive-time VIABLE addressable-household figures as the v3 regression baseline, per `TERRITORY-METHODOLOGY.md` §8.5/§8.6. **Locked as point-in-time reference values, not strict pass/fail regression targets** — a future deviation requires investigation before being treated as a code regression. Full detail (job IDs, probe sets at 15/25/35/45 min) lives in decision #94's `decision` field; summarized below, not duplicated verbatim. |

## What shipped since v2.30

| Item | PR | Result |
|---|---|---|
| **De-franchise platform identity + handoff v2.30 renumber** | #77 (`f696228`) | CLAUDE.md Project Identity corrected (decision #91). Handoff renumbered to v2.30. Docs-only. |
| **v3 async job model + GEOID census cache (504 fix)** | #78 (`b2e2ab2`) | Rearchitected `POST /api/territories/size` from a synchronous compute (which was 504-ing on real drive-time isochrones) to an **async job model**: the POST now enqueues and returns `202` + a `jobId`; the heavy compute runs out-of-band in a Netlify Background Function; a new poll route returns job status/result. Two new tables landed in migration `20260707120000_v3_sizing_jobs_and_bg_cache.sql`: **`territory_sizing_jobs`** (job queue/status/result) and **`census_block_group_cache`** (GEOID-keyed census cache). Also: precise polygon pre-clip, per-county batched census fetch with bounded concurrency + retry/backoff, and a superset-once refactor of the candidate-minute expansion search. Decision #93. **Known gap at merge time:** this PR's own in-process verification script never exercised the real HTTP trigger path — it validated the compute in-process but did not invoke the deployed Background Function over HTTP. That gap is exactly what PR #79 then had to fix. |
| **P0: background function was never invoked in production** | #79 (`997fe41`, **current main HEAD**) | The async model from #78 was silently non-functional in production. Two bugs, both discovered and fixed **same session**, not carried forward as known issues: **(1)** `src/middleware.ts` was **307-redirecting the internal trigger request to `/login`** — the internal fetch followed the redirect and silently swallowed it, so the Background Function was never actually invoked. **(2)** A second latent bug: the Background Function (`netlify/functions/size-territory-background.mts`) used the **legacy v1 `event.body` lambda shape** instead of the **v2 `Request`/`Response` signature** that Netlify actually invokes `.mts` functions with — so even once reached, it would not have parsed its input correctly. Both fixed; the async path now works end-to-end. Diff: `middleware.ts`, `size-territory-background.mts`, `territory-sizing-jobs.ts`. |

## v3 QA anchor lock — DONE (decision #94)

This was listed in v2.30 as the natural next step. **It is complete.** Three territories were locked as the v3 regression baseline — each reproduced **exactly across two independent production runs** before being locked:

| Territory | 15-min addressable (VIABLE) |
|---|---|
| Austin – Westlake | **59,699.47** |
| Dallas – Preston Hollow | **120,318.47** |
| Nashville – Green Hills | **33,969.31** |

Full detail — job IDs (two per territory) and the 15/25/35/45-min probe sets — lives in decision **#94**'s `decision` field. Do not treat this table as the sole source; #94 is authoritative.

**Residual risk — stated plainly, not softened:** the isochrone polygon is fetched **live from Mapbox on every job** (`cache: 'no-store'`, never persisted). Today's figures are proven reproducible **as of this session**, but they are **not immune to future Mapbox road-graph drift** — if Mapbox re-graphs the roads around a practice location, the same 15-minute isochrone can enclose a different set of block groups and the anchor figure can move without any code change. That is precisely why #94 locks these as **point-in-time reference values, not strict pass/fail regression targets**. Freezing/caching the isochrone geometry at lock time was proposed by Coder (this session) as the fix, but is **not built and not authorized** — it is flagged as a candidate for a future session, priority is Trace's call.

## Standing deferrals — re-checked against this session, not carried blindly

| Item | Owner | Status this session |
|---|---|---|
| **Isochrone-freeze for v3 QA anchors** (NEW) | Trace to prioritize, then Coder | Proposed by Coder this session as the fix for the #94 residual risk. Not built, not authorized. Candidate next track. |
| **390px mobile visual QA** — `/dashboard`, `/proposals`, generator panel | Pilot, on deploy-preview | Still not done. Natural pairing with resolving #88 (mobile bottom-tab count) in the same live look. |
| **Functional global search** (TopBar) | future Coder session | Unchanged — dead field by design, needs a full brief before wiring. |
| **Repo-wide token-lint broadening** | future Coder session | Unchanged — lint rule still scoped only to `src/components/proposal/**` and `src/app/p/**`. |
| `log:export` DECISION_LOG.md mirror regen | Coder, needs service-role env | Still blocked. Gap has grown: **#78–#94 all missing** from the mirror (was #78–#90 at v2.30). `SUPABASE_SERVICE_ROLE_KEY` now covers all 5 Netlify contexts including `dev` (confirmed this session), so the env prerequisite for a regen is now met — the regen itself still needs to be run. |
| **`MAPBOX_SERVER_TOKEN` + `CENSUS_API_KEY` provisioning** | ~~Trace~~ **DONE** | **Both provisioned and confirmed live this session.** This removes the blocker that previously gated any live drive-time run. |
| **`census-tiger.ts` / live census+isochrone path** | Coder (smoke test) | **No longer blocked** — with `CENSUS_API_KEY` + `MAPBOX_SERVER_TOKEN` provisioned, the live path was exercised for real by the #94 anchor-lock production runs (each anchor ran real production sizing jobs against live census + Mapbox). |
| Calendly Phase 1 provisioning | **Trace, manual, off-transcript** | Unchanged. |
| Resend provisioning | **Trace, manual, off-transcript** | Unchanged — still blocks live trigger emails. |
| Proposal generator send-copy claims review | Trace / Rick Dahlson | Unchanged — blocks any real prospect send (Hard Rule 10). |
| `hausauerghmd` clone retirement | Trace | Unchanged — parity-confirmed safer, not retired. |

## v3 drive-time — what's left

Backend sizing engine (PR #75) is merged, the async job model (PR #78/#79) works end-to-end in production, and the QA anchors are locked (#94). Remaining:

1. **Isochrone-freeze follow-up** (new, from this session) — cache/persist the isochrone geometry at anchor-lock time so the #94 anchors become hard regression targets rather than drift-sensitive reference values. Proposed, not authorized.
2. **UI wiring** — territory authoring flow, proposal map, and the two-ring → single-ring display change (flag #8, conceptually confirmed in #89, not yet built). Separate, larger-scope follow-on session.

## Decision needed next session

Pick the next track:

1. **Isochrone-freeze follow-up** (NEW — closes the #94 residual risk).
2. **v3 UI wiring** (bigger scope).
3. **390px mobile QA** (paired with #88).
4. **Provisioning punch-list** (Resend, Calendly still outstanding; Mapbox/Census now done).
5. **Session E** — still unopened, still needs explicit Trace authorization.

**Do not assume — ask or wait for direction**, same as every prior handoff.

## Security Advisor Status (re-checked this session)

- **7 always-true RLS policies** (`activities`, `call_scores`, `deals`, `outreach_touches`, `prospects`, `spoke_candidates`, `territories`) — unchanged.
- **No-policy tables at INFO (`rls_enabled_no_policy`)** — the set has expanded by the **two new sizing tables from PR #78**: `territory_sizing_jobs` and `census_block_group_cache` both have RLS **enabled with 0 policies** (confirmed this session). They join the previously-itemized `operator_enrichment`, `operator_score_records`, `operator_scores`, `operators`, `proposal_events`, `proposal_sessions`, `proposals`. Same benign class — RLS on, no policy yet — not a new regression.
- **PostGIS artifacts** — `spatial_ref_sys` RLS-disabled ERROR is now **formally adjudicated as accepted/standing via decision #92** (owner-role limitation, SRID reference data only). `postgis` extension-in-public WARN and `st_estimatedextent` (3 overloads) anon/authenticated SECURITY DEFINER WARN remain standard, unavoidable PostGIS-on-Supabase artifacts.
- `gate_decision_for_pr` and `rls_auto_enable` anon/authenticated SECURITY DEFINER exposure — unchanged, both previously dispositioned.

**Hard Rule 10 continues to block any live prospect send** regardless of any finding above and regardless of feature progress.

## Not This Session (escalate, don't creep)

Session E and v3 UI wiring remain unopened — explicit Trace authorization required for either. Isochrone-freeze is proposed but not authorized.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer** |
| Coder | git + schema + code + migrations (fresh context each session) |
| Pilot | GitHub UI + browser tasks (incl. deploy-preview visual QA) |
