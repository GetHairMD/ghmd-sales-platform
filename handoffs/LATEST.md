# GHMD Sales Platform — Handoff v2.21

Date: 2026-06-29 | Prepared by: Chat | Purpose: New chat bootstrap

## Current State — Exact Snapshot

| Item | State |
|---|---|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase | cprltmwwldbxcsunsafl |
| Netlify | ghmdsalesplatform (ID: 0a339783) |
| Branch | main at fc02cb9 — clean, single branch |
| Remote | origin/main only — all stale branches pruned |
| Sprint 1 Task 1 | COMPLETE — PR #19 merged |
| Sprint 1 Task 2 | COMPLETE — PR #21 merged (fc02cb9) |
| Sprint 1 Task 3 | NOT STARTED — Purchasing Power Index scaffold |
| Last merged PR | PR #21 — fc02cb9fb0a458b45637a6a2958e2fe08d26746e |
| Handoff in repo | v2.21 — handoffs/LATEST.md |
| Next handoff | v2.22 — to be cut by Chat after Task 3 PR merges |

## What Was Delivered This Session

Sprint 1 Task 2 — NPI Registry Scaffold (PR #21, merged fc02cb9)

Files delivered:

- `lib/npi/client.ts` — stateless HTTP to CMS NPI Registry public API v2.1; exports `npiClient(state, taxonomy, limit=200)`, `NpiResult`, `NpiError`, `NPI_TAXONOMY_HAIR`
- `lib/npi/queries.ts` — `getPhysicianCountByCounty(fips)`; full 50-state + DC FIPS→USPS map; never throws, returns 0 on failure
- `lib/npi/__tests__/queries.test.ts` — 6 mocked-HTTP Vitest tests
- `lib/census/territory-score.ts` — `npiDensity: number` added to `TerritorySignals`; wired into `computeTerritorySignals`
- `handoffs/LATEST.md` — updated with PR #21

Gates confirmed green: 19 tests passing (13 existing + 6 new) · build clean · NIP scan clean · no live API calls (fetch stubbed)

Documented Sprint 1 approximations (to be refined in Sprint 2):

- Geography: NPI API has no county filter — `getPhysicianCountByCounty(fips)` returns state-level counts proxied to county FIPS. Sprint 2 target: county-level proxy via zip-to-county crosswalk or geo-bounding.
- Taxonomy: "Dermatology" placeholder only. Plastic Surgery and Facial Plastic Surgery to be added in later sprint.
- API cap: 200-result limit per call. May undercount in dense metros — revisit at scoring calibration.

## Decisions Locked — Cumulative Log

**Decision 1: Affordability Anchor Corrected**

Old anchor: $10,200/year — wrong. New anchor: $2,974/year ($248/month blended) — Standard program ($6,500) through Ottri waterfall. ~93% approval rate, blended APR varies by credit tier, monthly range $150–$250 for Entry and Standard tiers.

**Decision 2: Corrected Afford% Bands**

| Income | Old | New |
|---|---|---|
| <$50K | 0% | 0% |
| $50K | 0% | 8% |
| $75K | 5% | 40% |
| $100K | 30% | 65% |
| $150K | 55% | 85% |
| $200K+ | 100% | 100% |

**Decision 3: PPI Formula Confirmed With Addendum**

Base: `purchasing_power_index = median_household_income ÷ (RPP/100)`

With rent burden: `purchasing_power_index = (median_household_income ÷ (RPP/100)) × (1 - rent_burden_pct)`

`rent_burden_pct` = share of households paying 35%+ of income on rent (B25070_010E)

Role: relative market ranking signal, not a direct affordability gate

**Decision 4: NPI Data Source**

Direct HTTP to `https://npiregistry.cms.hhs.gov/api/?version=2.1` — public endpoint, no key required. MCP connector appropriate for Chat-layer lookups only, not wired into platform codebase.

**Decision 5: NPI Cache Deferred**

`npi_provider_cache` Supabase table deferred to Sprint 2 hardening. Sprint 1 uses stateless HTTP with resilient error handling.

**Decision 6: Physician Density Signal Inversion**

High provider density = competitive headwind = lower territory score contribution. Signal inverted in `territory-score.ts`. Weighting formula to be defined by Chat in future session.

**Decision 7: Branch Hygiene — Three Fixes (all complete)**

- ✅ Auto-delete head branches: enabled in GitHub Settings → General → Pull Requests
- ✅ CLAUDE.md addition (this handoff): after any PR merges, delete local feature branch immediately; `git branch -a` must show only `main` and `origin/main` at session start
- ✅ Session gate: `git branch -a` check added as gate step

## Pending Backlog

| Item | Owner | Priority |
|---|---|---|
| Sprint 1 Task 3 — Purchasing Power Index scaffold | Coder (next) | Immediate |
| Excel affordability model correction | Manual (planning layer) | High — correct $10,200 → $2,974 anchor; update afford% bands per Decision 2 |
| Decision log markdown mirror (row 20 absent) | Chat | Low — Supabase table authoritative |
| npi_provider_cache Supabase table | Coder | Sprint 2 |
| NPI taxonomy refinement (Plastic Surgery + Facial Plastic) | Coder | Sprint 2 |
| County-level NPI density proxy | Coder | Sprint 2 |
| NPI weighting formula | Chat | Future session |
| Second GitHub account for PR approvals | Pilot/Admin | Recommended — branch protection currently does not require approval; self-approval blocked by GitHub natively |

## What Happens in New Chat

1. Paste this document as the opening message
2. Chat confirms state and drafts Coder prompt for Sprint 1 Task 3 (Purchasing Power Index scaffold)
3. Coder executes Task 3
4. Pilot reviews and merges Task 3 PR
5. Chat cuts v2.22

## Agent Roles

| Agent | Scope |
|---|---|
| Chat | PM + planning (this agent) |
| Coder | git + schema + code (local, fresh context each session) |
| Pilot | GitHub UI + browser tasks |
