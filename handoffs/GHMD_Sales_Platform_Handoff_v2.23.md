# GHMD Sales Platform — Handoff v2.23

Date: 2026-06-30 | Prepared by: Coder | Purpose: New session bootstrap

## Current State — Exact Snapshot

| Item | State |
|------|-------|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase | cprltmwwldbxcsunsafl |
| Netlify | ghmdsalesplatform |
| Branch | main at `b7dd1f0` (PR #31 merged) |
| Remote | origin/main |
| Branch protection | **main requires the `gate` status check** (`enforce_admins: false`) |
| Second-Opinion Gate | **LIVE for real sprint work as of 2026-06-30** |
| Open PRs | #34 (gate go-live touch-ups), this handoff PR (#TBD) |

## What Was Delivered This Session

### Sprint 2 (prior PRs, confirmed merged)

- **PR #26** — `npi_provider_cache` table (Sprint 2 Task 1) — merged.
- **PR #27** — NPI taxonomy filtering refinement (Sprint 2 Task 2) — merged.

### Second-Opinion Gate (governance infrastructure)

- **PR #28** — `ops.decision_log.residual_risk` columns (`residual_risk`,
  `residual_risk_owner`, `residual_risk_target_date`) + **CLAUDE.md Rule 14**
  (residual_risk set explicitly, read literally, never inferred). Row 13 closed
  (`residual_risk = none`, owner Trace). Merged.
- **PR #29** — Gate core: `scripts/second-opinion-gate/` (A1 prompt, A3
  asymmetric-agreement logic, PR-gate runner, weekly overdue sweep), two
  dormant-by-default GitHub workflows, `public.residual_risk_overdue()` safe
  projection function, `docs/SECOND-OPINION-GATE.md`. Merged.
- **PR #31** — Fix found by the Step 8 end-to-end test: GPT-5-class models reject
  `temperature: 0`; removed the override (defaults to 1) and added raw-response
  logging. Merged.
- **PR #34 (open)** — `residual_risk_standing` flag so the weekly sweep skips
  intentionally-undated standing decisions; docs marked gate LIVE.

### Gate go-live (this session)

- Secrets + `SECOND_OPINION_GATE_ENABLED=true` provisioned in GitHub Actions (Trace).
- **Step 7 done** — branch protection requires the `gate` check.
- **Step 8 done** — end-to-end tested live: silent-pass (no comment, green),
  GPT-side escalation (BLOCK), Coder-side escalation (`accepted`), fail-closed on
  API error, branch protection blocks merge, GitHub Mobile push confirmed received.

## Decision Log — Entries Logged

| id | Title | residual_risk | Notes |
|----|-------|---------------|-------|
| 22 | OpenAI Egress Boundary — No BAA Required, Confirmed by Code Audit | accepted | Intentionally undated standing decision (`residual_risk_standing = true`) |
| 23 | Escalation Delivery — GitHub Mobile Only, No SMS Channel | accepted | Intentionally undated standing decision (`residual_risk_standing = true`) |

Both are excluded from the overdue sweep by `residual_risk_standing = true`.

## How the Gate Works (one-line refs — see `docs/SECOND-OPINION-GATE.md`)

- Trigger-list PRs carry a `<!-- second-opinion-gate ... -->` block in the PR
  description (category 1–5, `coder_residual_risk`, `spec`). No block = auto-pass.
- Silent pass requires GPT-5 **and** Coder both `none`; any accepted/unresolved
  from either side, any hard exception, or any GPT unavailability escalates
  (fail closed). Escalation posts the A4 comment tagging Trace and fails the check.
- Trace clears an escalation by logging the disposition to `ops.decision_log` and
  admin-merging (`enforce_admins: false`).
- Weekly sweep flags overdue/undated `accepted` rows (except `standing = true`)
  via one persistent `residual-risk-overdue` GitHub issue.

## Pending / Next

| Item | Owner | Notes |
|------|-------|-------|
| Merge PR #34 + this handoff PR | Trace/Pilot | Gate touch-ups + handoff |
| Sprint 2 remaining tasks | Chat/Coder | Confirm scope at next session start |
| County-level NPI density proxy | Coder | Sprint 2 backlog (carried) |
| PPI_WEIGHT calibration | Chat | After 6–12 months outcome data (carried) |
| Excel affordability model correction | Manual | $10,200 → $2,974 anchor (carried) |

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning |
| Coder | git + schema + code (local, fresh context each session) |
| Pilot | GitHub UI + browser tasks (no terminal access) |
