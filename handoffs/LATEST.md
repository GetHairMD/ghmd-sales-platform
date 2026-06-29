# GHMD Sales Platform Handoff v2.19

Date: 2026-06-29
Session type: Chat (PM + Planning)
Prepared by: Claude Chat
Status: Ready for commit

## What Was Completed This Session

Operator scoring schema confirmed merged — migrations 20260629000000_operator_scoring_schema.sql and 20260629000001_fix_override_rates_view_security.sql both present and verified in supabase/migrations/. PRs #13, #15, #16, #17 confirmed merged and closed.

Census API scaffold fully designed — Sprint 1 Task 1 Coder prompt authored, reviewed, and corrected through two rounds:

- Demographic model corrected: male and female cohorts 20–79 (80+ excluded — propensity to act negligible), coefficients sourced from GHMD proprietary demand model table
- Physician density proxy (C24030_044E) dropped — NPI Registry confirmed as source (separate scaffold, Sprint 1 Task 2)
- Architecture decision: raw cohort counts returned from Census layer; coefficients applied in scoring layer (territory-score.ts); constants in /lib/census/constants.ts structured to mirror future Supabase config row

CENSUS_API_KEY added to Netlify env vars for ghmdsalesplatform, confirmed activated by Census Bureau API Team.

Backlog item carried forward — log:export script missing from package.json; decision log markdown mirror is one row behind (row 20 absent). Supabase table remains authoritative.

## Confirmed State

| Item | State |
|------|-------|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase project | cprltmwwldbxcsunsafl |
| Netlify site | ghmdsalesplatform (ID: 0a339783) |
| Sprint 1 | OPEN |
| Migrations | 20260629000000, 20260629000001 — both present |
| Working tree | Clean, no NIP contamination |
| CLAUDE.md | First line correct |
| CENSUS_API_KEY | In Netlify env vars, activated |

## Decisions Logged This Session

Decision: Census scaffold returns raw cohort counts; coefficients applied in separate scoring layer.
Rationale: Decouples Census data release cycle from model tuning cycle. Constants structured for easy promotion to Supabase config table when per-market tuning is required.
Authority: Chat (Trace confirmed)

Decision: Physician density signal deferred to NPI Registry scaffold (Sprint 1 Task 2). Census proxy (C24030_044E) dropped entirely.
Authority: Chat (Trace confirmed)

Decision: Demographic cohorts 80–84 and 85+ excluded from demand model. Propensity to act at 0.5%/1.0% contributes negligible signal.
Authority: Chat (Trace confirmed)

## NEXT SESSION — IMMEDIATE WORK

Sprint 1, Task 1: Census API Scaffold
Coder prompt is complete and reviewed. Coder session was blocked this session on missing v2.19 handoff (gate held correctly). With this handoff committed, Coder is cleared to proceed.

Coder first action: Re-run session start checks against v2.19. All other pre-flight items confirmed green. Proceed directly to feature/census-api-scaffold branch.

Pending backlog (do not block Sprint 1 on this):

- Add log:export script to package.json
- Commit missing decision log row 20 to markdown mirror

## Agent Roles Reminder

- Chat — PM + planning (this agent)
- Coder — git + schema + code (Local folder, fresh context each session)
- Pilot — GitHub UI + browser tasks
