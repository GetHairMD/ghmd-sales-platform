# GHMD Sales Platform — Handoff v2.22

Date: 2026-06-29 | Prepared by: Chat | Purpose: New chat bootstrap

## Current State — Exact Snapshot

| Item | State |
|------|-------|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase | cprltmwwldbxcsunsafl |
| Netlify | ghmdsalesplatform (ID: 0a339783) |
| Branch | main at 342fb2ee — clean, single branch |
| Remote | origin/main only |
| Sprint 1 Task 1 | COMPLETE — PR #19 merged |
| Sprint 1 Task 2 | COMPLETE — PR #21 merged (NPI scaffold; conflict-resolved into main via PR #23 merge) |
| Sprint 1 Task 3 | COMPLETE — PR #23 merged (342fb2ee) |
| Last merged PR | PR #23 — PPI scaffold + NPI conflict resolution |
| Handoff in repo | v2.22 — handoffs/LATEST.md |
| Next handoff | v2.23 — to be cut by Chat after next PR merges |

## What Was Delivered Last Session

### Sprint 1 Task 3 — Purchasing Power Index Scaffold (PR #23, merged 342fb2ee)

Files delivered:

- `lib/census/ppi.ts` — exports `PpiInputs`, `computePpi()`, `PPI_SIGNAL_NOTE`; base + rent-burdened formulas; never throws, returns 0 on invalid input
- `lib/census/__tests__/ppi.test.ts` — 15 Vitest cases (moved from root to `__tests__/` pre-merge for convention consistency)
- `lib/census/territory-score.ts` — `ppi: number` added to `TerritorySignals`; `computePpi()` wired in; `PPI_WEIGHT = 0.0` placeholder with `// TODO: calibrate` comment

Gates confirmed green: 28 tests passing (13 existing + 15 new) · TypeScript clean · no live API calls · no new Supabase tables

Conflict resolved at merge: `territory-score.ts` had conflicts between `ppi` (Task 3) and `npiDensity` (Task 2, which landed in main via PR #21). Both fields kept — correct additive result. Resolution commit c9f6344.

## Decisions Locked — Cumulative Log

(Decisions 1–7 unchanged — see v2.21)

**Decision 8: Test File Convention**

All test files live under `lib/[module]/__tests__/`. Confirmed by pre-merge fix moving `ppi.test.ts` from `lib/census/` root to `lib/census/__tests__/`.

## Sprint 1 — Complete

All three tasks delivered:

- Task 1: Census scaffold (PR #19)
- Task 2: NPI Registry scaffold (PR #21)
- Task 3: Purchasing Power Index scaffold (PR #23)

## Pending Backlog

| Item | Owner | Priority |
|------|-------|----------|
| Excel affordability model correction | Manual | High — update $10,200 → $2,974 anchor; afford% bands per Decision 2 |
| NPI weighting formula | Chat | Future session |
| npi_provider_cache Supabase table | Coder | Sprint 2 |
| NPI taxonomy refinement (Plastic Surgery + Facial Plastic) | Coder | Sprint 2 |
| County-level NPI density proxy | Coder | Sprint 2 |
| PPI_WEIGHT calibration | Chat | Future session — after 6–12 months outcome data |
| Second GitHub account for PR approvals | Pilot/Admin | Recommended |
| Decision log markdown mirror (row 20 absent) | Chat | Low |

## Process Fix — Logged for CLAUDE.md

Handoff SHA must be written at merge-time by Pilot, not estimated by Chat. Pilot to report confirmed merge SHA → Chat writes handoff. Prevents stale-SHA gate failures at Coder session open.

## What Happens in New Chat

1. Paste this document as opening message
2. Chat confirms state and drafts Sprint 2 scope or next prioritized task
3. Coder executes
4. Pilot reviews and merges
5. Chat cuts v2.23

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning |
| Coder | git + schema + code (local, fresh context each session) |
| Pilot | GitHub UI + browser tasks (no terminal access) |
