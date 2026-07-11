# GHMD Sales Platform — Handoff v2.39

Date: 2026-07-10 | Prepared by: Coder at session close (docs/AGENTS.md session-close rule),
for Chat/Trace review | Purpose: capture the isochrone-freeze for the v3 QA anchors (PR #107,
decision #129 implementing #96 as Option B), and two newly-adopted decisions that change the
standing picture — #128 (a go-live data-wipe precondition, new) and the still-open anchor
**classification** question (#96). Supersedes v2.38.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and
> security-advisor status are derived live at every session start (git, `ops.decision_log`,
> `get_advisors`). This handoff carries narrative only. If a state fact appears below, it is
> illustrative context as-of the handoff date, not a source of truth.

## Stable identifiers (these do not drift)

| Item | Value |
|------|-------|
| Repo | `GetHairMD/ghmd-sales-platform` |
| Supabase project | `cprltmwwldbxcsunsafl` (ghmd-sales-platform) — NIP `kjweckggegifjmmqccul` is a separate production system, **never touch** |
| Netlify | `ghmdsalesplatform.netlify.app` (main auto-deploys) |
| monday.com Sprint Board | `18419216445` ("GHMD Sales Platform — Sprint Board", per `docs/AGENTS.md`) |

## State as of this handoff (illustrative — verify live)

- Main HEAD `7a7e597` (PR #107 squash-merge). Decision-log tip: **#129**. Open PRs: the v2.39
  handoff PR itself (this one); otherwise 0.
- `ops.decision_log` OPEN entries (the authoritative open-decision queue): exactly **two —
  #96 and #121** (see Standing queue). Everything else is either ADOPTED/SUPERSEDED in the log
  or narrative backlog with no decision entry.
- `get_advisors`: **no new advisories introduced this session** (no DDL — the PR is
  fixture/test/doc only). Standing items only, all pre-existing and previously adjudicated or
  accepted: `public.spatial_ref_sys` RLS-disabled ERROR (adjudicated accepted/standing via
  decision **#92** — PostGIS artifact, SRID data only); `postgis` extension-in-public WARN;
  several service-role-only tables (incl. `census_block_group_cache`, `territory_sizing_jobs`,
  `proposals`) showing `rls_enabled_no_policy` INFO **by design** (deny-all + service_role
  bypass); PostGIS/infra `SECURITY DEFINER` function WARNs; assorted performance INFO/WARN
  (unindexed FKs, unused indexes, RLS-initplan). Do not re-open these on a future advisor run
  without a fresh Trace decision.

## What shipped since v2.38

### 1. Isochrone-freeze for the v3 QA anchors — PR #107, decision #129 (ADOPTED), implements #96 (Option B), merged `7a7e597`

The v3 §8.8 QA anchors (Austin / Dallas / Nashville; figures per decision #127) were
*point-in-time references, not regression targets*, because the v3 engine fetches its isochrone
**live from Mapbox on every job** — a road-graph change can move the figure with no code change.
This PR freezes them as **real-derived offline fixtures + a CI regression test** so the
addressable figures reproduce **exactly, with no live Mapbox/Census call**.

**Option B, as Trace directed.** The #127 addressable is a function of three inputs — isochrone
geometry, census households inside it, and the credit table — not the isochrone alone; and the
`territory_sizing_jobs` rows store only `{result, provenance, sizedContour}` (no census). So the
freeze sources:
- the **winning isochrone contour** from each anchor's job row (`sizedContour`; job IDs
  `14fb63ba…` Austin / `d6efac7b…` Dallas / `7caf4c20…` Nashville);
- the **contributing census block groups** from `public.census_block_group_cache`, under an
  **upper-bound integrity filter** `fetched_at <= 2026-07-10T14:59:35.001Z` (the last #127 job
  finish). This is an *upper* bound, not a run-window, because the #127 runs were
  warm-cache-dominated (only ~17 rows written during the run; the rest reused from earlier), so
  a lower-bounded window would have reproduced nothing. It includes the warm rows the run
  genuinely used and excludes any post-#127 refresh (of which there are none). Completeness is
  proven by *exact reproduction*, not by the timestamp.
- the already-committed credit table (`data/experian-credit-share-by-state.json`).

Deliverables: `src/lib/__fixtures__/qa-anchors/*.json` (each with a provenance header),
`src/lib/__fixtures__/v3-qa-anchors.ts` (typed loader),
`src/lib/__tests__/v3-qa-anchors.regression.test.ts` (regression test, part of the CI suite —
passes with `MAPBOX_SERVER_TOKEN`/`CENSUS_API_KEY` unset), and a one-time generator
`scripts/freeze-qa-anchor-fixtures.ts` (not CI-run; self-verifies before emitting).
`TERRITORY-METHODOLOGY.md` §8.7/§8.8 updated. Full suite: 993 tests passing.

**Scope limitation — state it plainly, do not oversell.** The freeze validates the
**addressable-arithmetic path (`apportionB19001 → computeAddressableForPolygon`) at each
anchor's already-locked winning minute** — it does **NOT** exercise the drive-time
expansion / minute-selection search (that needs every probed contour; only the *winning* contour
is persisted per job). The minute-selection search remains covered only by the synthetic-curve
unit tests in `territory-sizing-v3.test.ts`. A green freeze test is **not** whole-engine
end-to-end certification. Production sizing is **unchanged** — a real territory is still sized
against a *live* Mapbox isochrone. **Zero writes** to `public.territories` /
`public.territory_sizing_jobs`; no migrations (confirmed via PR diff). The three `qa_locked`
anchor rows are untouched.

### 2. Decision #128 (ADOPTED) — go-live data-wipe precondition (NEW standing gate)

**This is a new go-live precondition that did not exist in any prior handoff — treat it as a
standing precondition, not a backlog nice-to-have.** All current platform data — territories,
prospects, proposals, `territory_sizing_jobs` — is **test/validation data**. Before go-live with
real prospects/territories, a **full data wipe is required, including removal from
front-end/dashboard surfaces** (not just backend cleanup). Explicitly **NOT** in scope for the
wipe: formula code, methodology, and any code-level QA fixtures — including the #96 freeze
fixtures shipped this session — which are **product, not data**. **Open within #128**
(`residual_risk = unresolved`): the disposition of the three `qa_locked` territories rows at wipe
time is not yet decided.

### 3. Decision #129 (ADOPTED) — logs the freeze build (related_pr 107)

Records item 1 above. **Open item carried in #129, must stay visible:** whether the three
anchors are **promoted from point-in-time reference values to hard pass/fail regression
targets** is still an **open Trace decision** — not resolved by #129 or #96, which is precisely
why **#96 remains OPEN**. Chat's recommendation *(on record, not a decision)*: keep point-in-time
for now. The build did **not** self-promote the classification; the doc keeps the point-in-time
framing.

## Standing queue — reprioritized (re-derived live, not hand-renumbered)

**Open decisions in `ops.decision_log` (authoritative — re-derive the live set; #121 adopted
post-v2.39, moved to "Removed from the open queue" below):**

| Decision | Item | Owner | Status |
|---|---|---|---|
| **#96** (OPEN) | **Anchor classification** — promote the three v3 QA anchors from point-in-time references to hard pass/fail regression targets? The freeze **build** is done (#129); this is the residual open sub-question. | Trace | Open. Chat recommends keeping point-in-time. |

**Narrative backlog (no decision entry, or externally owned) — carried from v2.38; verify each
before acting, do not assume this wording is still current:**

| Item | Owner | Status |
|---|---|---|
| Territory-creation / authoring flow scoping (likely the first *new* service-role `territories` writer — PR #104 triggers protect it by construction) | future Coder | Deferred; needs its own scoping brief |
| v3 authoring-flow **polling UI** (frontend wiring to enqueue/poll `territory_sizing_jobs`) | future Coder | Unopened |
| 390px / authenticated deploy-preview QA tooling gap | Trace / future Coder | No fix path identified; still limits browser QA on auth'd surfaces |
| `qualification_reviews` / `rep_call_grades` FK cascade behavior | Trace decision | Open, not urgent (no decision entry) |
| Session E; Platform RBAC (raised 2026-07-08) | Trace authorization | Unopened |
| Rick Dahlson copy review (#68/#71, `legal_flag`) | Trace / Rick | Still the real gate on any live prospect send |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Paused externally, unchanged |
| Legacy public `/proposals/[prospectId]` retirement; `reserved_for` dead column; TopBar global search; repo-wide token-lint; PRD v1.2 embedded-signing staleness; prospect-page hydration (#418/#423/#425); Resend + Calendly provisioning; proposal revenue-model gap (§14 illustrative-only, #71/#76) | various | All unchanged from v2.36–v2.38 — carry forward, do not re-litigate |

**Removed from the open queue this session:**
- **Isochrone-freeze (#96 build)** — v2.38 listed it priority 1 "Proposed, not built." **Done**
  this session (PR #107 / #129); moved to "What shipped." (The #96 *classification* sub-question
  remains, above.)
- **monday.com board ID "discrepancy"** — v2.38 listed it "Unreconciled since 2026-07-07." It was
  **never a real conflict**: two distinct real boards were conflated in Chat's memory —
  `18419216445` "GHMD Sales Platform — Sprint Board" (the correct one per `docs/AGENTS.md`) and
  `18391502210` "Trace To-Do Items" (a separate personal board). No repo or decision-log action
  was needed or taken. Removed from open items; recorded here for context only.
- **National Map (#121)** — v2.39 listed it OPEN/unscoped. **Built and merged post-v2.39
  (2026-07-11)**, PR #110, squash `c782653`. Full arc: the Second-Opinion Gate correctly BLOCKED
  the first revision on a `boundary_geojson` properties leak (GeoJSON `Feature` /
  `FeatureCollection` `properties` crossing the wire regardless of status); fixed server-side
  (`territory_status_map()` normalizes to a bare, properties-stripped geometry); independently
  re-verified; the gate passed clean on the corrected commit. Decision **#133** (ADOPTED) has the
  full record; #121 itself flipped OPEN → ADOPTED.
- **Demo data on `/national-map`:** 63 seeded territories rendering **21 sold / 21
  in_pipeline / 21 available** for visual QA of the status-color rendering (plus the 3
  original QA-anchor territories = 66 total). `in_pipeline` is *derived, not stored*: the 21
  sold + 21 in_pipeline are backed by 42 demo prospects (`prospects.lead_source =
  'demo_data'`); the 21 available demo territories have no linked prospect. All demo
  territories are tagged `territories.name LIKE 'Demo — %'`. Cleanup is **two ordered
  deletes** (the `prospect_id` FK is RESTRICT, not cascade): the demo **territories** first
  (`name LIKE 'Demo — %'`, 63 rows), then the demo **prospects** (`lead_source = 'demo_data'`,
  42 rows) — verified to have no other dependents. Not yet cleaned up as of this handoff;
  covered by decision **#128**'s go-live wipe precondition (no new decision needed).

## Residual risks (stated plainly)

- **Go-live data-wipe precondition — NEW standing gate (#128).** All platform data is test data;
  a full wipe (including front-end/dashboard surfaces) is required before real-prospect go-live.
  `qa_locked` territories-row disposition at wipe time is **unresolved**. Formula/methodology and
  code-level QA fixtures (incl. the #96 freeze) are explicitly out of wipe scope.
- **#96 freeze scope limitation — accepted.** The offline regression fixture reproduces the
  addressable arithmetic at each anchor's locked winning minute only, **not** the full
  expansion / minute-selection search (only the winning contour is persisted per job). The
  minute-selection search stays covered by synthetic-curve unit tests. A green freeze test ≠
  whole-engine certification.
- **v3 anchors still drift with live Mapbox in production** (longstanding) — the freeze is
  test/CI-layer only; production still fetches the isochrone live per job. Whether a deviation is
  drift vs. a code regression is now *mechanically* discriminable for the addressable arithmetic
  (frozen input → frozen output), but the anchor classification remains open (#96).
- **RLS-bypass write pattern — CLOSED at the DB layer** by PR #104 (v2.38), unchanged this
  session. Two documented residuals remain, both accepted and **not re-litigated here**: (a) the
  `sold_boundary_geom` escape hatch assumes `current_user='postgres'` is the sole admin/redraw
  role; (b) sold/reserved rows have no DB-level DELETE guard (only the boundary is frozen;
  `qa_locked` DELETE is covered).
- **Authenticated deploy-preview QA has no automated path** — limits browser QA on auth'd
  surfaces; carried forward.

## Not This Session (escalate, don't creep)

The territory-authoring flow, the v3 polling UI, Session E /
Platform RBAC, Box Sign, and the **#96 anchor-classification promotion** all remain
unopened/unauthorized — each requires explicit Trace authorization before a future session works
it. The #96 freeze **build** and decisions **#128 / #129**, done this session, are removed from
this list.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable (deploy-preview QA reassigned to Coder — see `docs/AGENTS.md`) |
