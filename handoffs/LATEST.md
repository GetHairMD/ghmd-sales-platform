# GHMD Sales Platform Handoff v2.20

Date: 2026-06-29
Session type: Pilot (GitHub UI)
Prepared by: Claude Pilot
Status: Ready for commit

## What Was Completed This Session

Sprint 1 Task 1 — Census API scaffold — **merged and closed** via PR #19.

PR #19 (`feat: Census API scaffold — territory signals (Sprint 1 Task 1)`) merged into `main` from `feature/census-api-scaffold`. 1 commit, 10 files changed (+6,318 / -4,033). All verification gates passed:

- `npm run test` → 13 passed
- `npm run build` → passes, no type errors (`tsc --noEmit` clean)
- NIP contamination scan on new files → clean
- Deploy preview confirmed live on Netlify

Files delivered in PR #19:

| File | Purpose |
|---|---|
| `lib/census/client.ts` | Typed `censusClient` singleton, `CensusError`, `CENSUS_YEAR` constant. Server-side only; `CENSUS_API_KEY` read at call time, never logged/bundled. |
| `lib/census/constants.ts` | `DEMAND_COEFFICIENTS` (bands 20–79; 80+ excluded), `DemandCoefficient` type, `MHHI_TIERS`. Shaped as flat rows to mirror a future Supabase config table. |
| `lib/census/queries.ts` | Raw ACS5 pulls: `getCohortPopulationByCounty` (B01001), `getMHHIByCounty` (B19013), `splitFips`. No coefficients applied here. |
| `lib/census/territory-score.ts` | `computeTerritorySignals` orchestration + `computeDemandByAgeBand`/`mhhiTier` pure helpers. NPI density TODO placeholder. |
| `src/app/api/census/territory/route.ts` | `GET /api/census/territory?fips=XXXXX`, Supabase-session gated, fips validated, sequential. |
| `lib/census/__tests__/queries.test.ts` | 13 unit tests, all Census HTTP mocked. |
| `.env.local.example` | Documents env vars (incl. `CENSUS_API_KEY`). |
| `package.json` | Added `vitest` devDep + `test` script. |
| `tsconfig.json` | Excluded `**/__tests__/**` from Next production typecheck. |

Census variable code corrections verified against live Census Bureau variable list on 2026-06-29. ACS B01001 sub-cohort summing corrected (18-24 and 60-69 ranges split into finer sub-cohorts). Corrected mapping confirmed matching `src/lib/census.ts`.

SPRINT-STATE.md created this session — tracks PR merge history and sprint task completion.

## Confirmed State

| Item | State |
|---|---|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase project | cprltmwwldbxcsunsafl |
| Netlify site | ghmdsalesplatform (ID: 0a339783) |
| Sprint 1 | OPEN |
| Sprint 1 Task 1 | COMPLETE — PR #19 merged |
| Sprint 1 Task 2 | NEXT — NPI Registry scaffold |
| Working tree | Clean post-merge |
| CENSUS_API_KEY | In Netlify env vars, activated |
| SPRINT-STATE.md | Created — PR #19 entry logged |

## Decisions Logged This Session

No new architectural decisions this session. PR #19 merge closes all open Census scaffold decisions from v2.19.

## NEXT SESSION — IMMEDIATE WORK

**Sprint 1, Task 2: NPI Registry Scaffold**

Census layer is complete and merged. Next scaffold pulls physician density signal from NPI Registry to feed into `computeTerritorySignals` (NPI density TODO placeholder already present in `lib/census/territory-score.ts`).

Coder first action: Re-run session start checks against v2.20. Proceed to `feature/npi-registry-scaffold` branch.

Pending backlog (do not block Sprint 1 on this):

- Add `log:export` script to `package.json`
- Commit missing decision log row 20 to markdown mirror

## Agent Roles Reminder

- **Chat** — PM + planning (this agent)
- **Coder** — git + schema + code (Local folder, fresh context each session)
- **Pilot** — GitHub UI + browser tasks

## Pending PRs

| PR | Title | Branch | Status |
|---|---|---|---|
| [#21](https://github.com/GetHairMD/ghmd-sales-platform/pull/21) | feat: NPI Registry scaffold — physician density signal (Sprint 1 Task 2) | `feature/npi-registry-scaffold` | Open — awaiting review, do not merge |
