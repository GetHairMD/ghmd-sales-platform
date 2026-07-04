# GHMD Sales Platform — Handoff v2.25

Date: 2026-07-03 (crm-demo-v1 kickoff) | Prepared by: Coder | Purpose: New session bootstrap — supersedes v2.24
Supersedes: v2.24 (formula-v2 mid-sprint snapshot — that sprint has since SHIPPED).

## Current State — Exact Snapshot

| Item | State |
|------|-------|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase | `cprltmwwldbxcsunsafl` (NIP `kjweckggegifjmmqccul` — never touch) |
| Netlify | ghmdsalesplatform.netlify.app (main auto-deploys) |
| main | **`306fdbd`** — even with origin/main (PRs #50–55 merged) |
| Branch protection | main requires the `gate` status check (Second-Opinion Gate LIVE) |
| Active branch | `chore/p-1-reconciliation` (this P-1 reconciliation PR) |
| Governing doc | [`docs/prd/GHMD_Territory_Sales_OS_PRD_v1.2.md`](../docs/prd/GHMD_Territory_Sales_OS_PRD_v1.2.md) |
| Decision mirror | `/decisions/DECISION_LOG.md` — regenerated through live table (43 entries; ids run 1–54 with gaps at 49/51/52) |

## What Shipped Since v2.24

| Work | PR | Result |
|------|----|--------|
| formula-v2-public-source | #51 | Public-source addressable-market methodology. QA anchors: national **69.6M** @PTI8 (69,581,844) / **56.3M** @PTI5 (56,283,042) · Marin 64,194 @PTI8. Constants in `/lib/addressable-market-constants.ts`. |
| pipeline-v2 | #52 | Single **11-stage** state machine in `src/lib/pipeline-stages.ts` + `prospects.deal_status` health overlay (active/stalled/lost) + soft funding-prequal gate (`FUNDING_PREQUAL_GATE_STAGE`). Replaces the two-machine model. |
| territory-output-v2 | #53 | `penetrationScenarios` wired into public + internal surfaces. |
| AGENTS.md refresh | #54 | Locked agent names (Chat/Coder/Pilot), repo slug, Chat governance. |
| SPRINT-STATE grandfathering strike | #55 | Stale grandfathering ref struck. |

## Current Sprint — crm-demo-v1

**Mission:** Build the Territory Sales OS front-end per PRD v1.2 — three surfaces (Pipeline Board `/pipeline`, Deal Room `/prospects/[id]`, public Proposal Page `/proposals/[prospectId]`), modified **in place**, demo-grade on seeded data.

**Scope: P-1 → P0 → P0.5 → P1.** Nothing beyond P1.

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **P-1** | Reconciliation commit (docs-only): log:export, SPRINT-STATE + handoff to reality, PRD committed, orchestration skill/agents, CLAUDE.md evidence + subagent rules | **THIS PR (in progress)** |
| P0 | Brand tokens → `src/design/tokens.ts` + Tailwind + Storybook foundation components (PRD §4.2–4.3) | Blocked on logo files (Trace) |
| P0.5 | M0 baseline migration (untracked base DDL) + M0.5 designations (`deals.stage` deprecation comment, `call_scores` = Salesperson Scorecard) | Pending |
| P1 | DEMO: board (6 grouped columns + priority list + metric strip), Deal Room (3-column command center), Proposal Page (brand quality), idempotent seed script (every stage + one stalled + TRIAGE SKIPPED + PRE-QUAL SKIPPED) | Pending |

## Governance Changes (decision_log)

- **#54 — Sequential-sprint rule RETIRED** → **reconciliation precondition** (no new sprint opens until SPRINT-STATE + LATEST.md + decision mirror all reflect main HEAD) + **session-boot rule** (architecture/PRD sessions pull `ops.decision_log` and `/handoffs/LATEST.md` first). The old "Sprints are sequential" rule no longer governs.
- **#53 — PRD v1.2 ADOPTED** (⚖ legal flag): `deals` demoted to Territory Agreement record; **`deals.stage` DEPRECATED**; soft triage gate at stage 4→5 (`skipped_triage` flag + amber badge, mirrors funding-prequal pattern); `call_scores` designated **Salesperson Scorecard**; routes modified in place (no `/demo/*`).
- **#50 — Grandfathering RETIRED** (supersedes #40). *#49/#51/#52 are decision-id sequence gaps, not missing entries.*
- Adoption (#53) and governance (#54) were logged by Chat this session — **do NOT re-log.**

## Hard Constraints (PRD §12)

- Stage constants only via `src/lib/pipeline-stages.ts`; formula constants only via `/lib/addressable-market-constants.ts`; prospect creation only via `src/lib/prospect-insert.ts`.
- Frontend **reads** state, never computes it; all gates + skip-recording server-side (SECURITY DEFINER RPC).
- RLS on every table from creation. Squash-merge only, feature branch + PR, no direct push to main. Second-Opinion Gate every PR. Every phase-close decision-logged with explicit `residual_risk`.
- Read the frontend-design skill + brand package before any UI work — planning-PDF navy/teal mockups are **NOT** the target.

## STOP POINTS

1. **P-1 PR open** → Trace review (reconciliation-precondition check). ← *we are here*
2. **P0 open** → logo files from Trace.
3. **End P1** → Trace design review.

## Open Blocker (P-1)

Task 6 supplies `.claude/skills/ghmd-orchestration/SKILL.md`, `.claude/agents/implementer.md`, `.claude/agents/sweeper.md` as "(text provided)" — **the text was not included in the kickoff.** The two CLAUDE.md additions (evidence rule + subagent-no-decision-log rule) were quoted verbatim and are applied. The three file bodies await Trace. See the P-1 PR description.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops (Drive, Supabase console, Monday.com); owns `ops.decision_log` writes |
| Coder | git + schema + code + migrations (local, fresh context each session) |
| Pilot | GitHub UI + browser tasks (no terminal access) |
