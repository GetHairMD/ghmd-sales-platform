# Sprint State — GHMD Sales Platform

Last updated: 2026-07-03 (crm-demo-v1 kickoff)

## Current Sprint

**crm-demo-v1 — Territory Sales OS front-end (Pipeline Board · Deal Room · Proposal Page)**
Status: **OPEN** · Governing doc: [`docs/prd/GHMD_Territory_Sales_OS_PRD_v1.2.md`](prd/GHMD_Territory_Sales_OS_PRD_v1.2.md)
Scope: **P-1 → P0 → P0.5 → P1** (nothing beyond P1 this sprint).
Source of truth: `/handoffs/LATEST.md` (v2.25) · Decision mirror: `/decisions/DECISION_LOG.md`.

> PRD v1.2 §4 (§21) — stage semantics have **one** source of truth: `src/lib/pipeline-stages.ts`.
> Formula constants live in `/lib/addressable-market-constants.ts` (Rule 6). Prospect creation only via `src/lib/prospect-insert.ts` (Insert contract).

## Ground Truth (reconciled to main HEAD)

- **main = `306fdbd`** (PRs #50–55 merged).
- **formula-v2-public-source SHIPPED** — PR #51 (public-source addressable-market methodology; QA anchors 69.6M @PTI8 / 56.3M @PTI5 / Marin 64,194).
- **pipeline-v2 SHIPPED** — PR #52 (single 11-stage machine in `src/lib/pipeline-stages.ts`, `deal_status` health overlay, soft funding-prequal gate).
- **territory-output-v2 SHIPPED** — PR #53 (penetrationScenarios wired into public + internal surfaces).
- **AGENTS.md refresh** — PR #54 · **SPRINT-STATE grandfathering strike** — PR #55.
- **Sequential-sprint rule RETIRED** — decision_log **#54**. Replaced by the **reconciliation precondition**: no new sprint opens until `docs/SPRINT-STATE.md`, `/handoffs/LATEST.md`, and `/decisions/DECISION_LOG.md` all reflect main HEAD. Plus the **session-boot rule**: any architecture/PRD session opens by pulling `ops.decision_log` and `/handoffs/LATEST.md`. (Supersedes the former "Sprints are sequential — do not open Sprint N+1" rule below.)

## PRD Phasing (crm-demo-v1 scope = P-1 → P1)

| Phase | Title | Status | Exit |
|-------|-------|--------|------|
| **P-1** | Reconciliation commit (docs-only) | **IN PROGRESS** | This PR merges; state reflects main HEAD |
| **P0** | Brand tokens → `tokens.ts` + Tailwind + Storybook foundation | BLOCKED | Logo files from Trace at P0 open |
| **P0.5** | M0 baseline migration (+ M0.5 designations) | PENDING | Advisors clean; #53 residual risk closed |
| **P1** | DEMO — 3 surfaces in place on seeded data | PENDING | Trace would show it to anyone |
| P2 | MVP — live capture (Recall/AssemblyAI, Tier 2, calibration) | OUT OF SCOPE | — |
| P3 | v1 — deal-close path (Box, engagement, wizard, Won capture) | OUT OF SCOPE | — |
| P4 | v2 — automation, sequencing, stall detection, multi-user auth | OUT OF SCOPE | — |

Each phase closes with: Second-Opinion Gate, security-advisors sweep, decision-log entry with explicit `residual_risk`.

## STOP POINTS (this sprint)

1. **P-1 PR open** → Trace review (reconciliation-precondition check).
2. **P0 open** → logo files from Trace before token/brand work.
3. **End P1** → Trace design review.

## Locked decisions (do not reopen)

- **decision_log #50** — Grandfathering RETIRED (supersedes #40; in-flight-proposal grandfathering + penetration-bridge policy retired, locked). *(Corrects the prior stale "#49" reference — #49 is a sequence gap, not an entry.)*
- **decision_log #53** — PRD v1.2 ADOPTED (⚖ legal flag; deals demoted to Territory Agreement record, `deals.stage` DEPRECATED; soft triage gate 4→5; `call_scores` = Salesperson Scorecard; routes modified in place).
- **decision_log #54** — Sequential-sprint rule retired → reconciliation precondition + session-boot rule.
- **Formula anchors (#37/#44–47)** — Affordability Anchor V2 ($37,415 @ 8% PTI), income/credit sourcing, national QA targets. Shipped in PR #51; do not re-derive.
- **#41/#42** (Hub-Spoke V1, NDP+EIP V1) are `platform='cross'` context — not this sprint's code, awareness only.

## Hard constraints (PRD §12 Coder handoff)

- Stage constants only via `src/lib/pipeline-stages.ts` imports — no hardcoded stage integers.
- Formula constants only via `/lib/addressable-market-constants.ts`.
- Prospect creation only via `src/lib/prospect-insert.ts`.
- Frontend **reads** state, never computes it; all gates + skip-recording server-side.
- RLS on every table from creation. Squash-merge only. Second-Opinion Gate every PR.
- Routes modified **in place** — no `/demo/*` namespace; demo state via seed script.

## Open external blockers (owner → phase)

| Item | Owner | Blocks | Status |
|------|-------|--------|--------|
| GHMD logo files (full-color, white, black) | Trace | P0 brand tokens | OPEN |
| `NEXT_PUBLIC_MAPBOX_TOKEN` in Netlify env | Trace | Proposal Page map | OPEN |
| Box Sign creds (`BOX_CLIENT_ID`/`_SECRET`/`_WEBHOOK_SECRET`) | Trace | P3 signing (out of scope now) | OPEN |
| Physician testimonials (2–3 quotes + photos) | Bruce | P3 Proposal imagery | OPEN |
| Retention-window number (PRD §9.6) | Rick | P3 retention posture | OPEN |

## Standing critical flags

- **Call recording**: notification at the open of every call (ByrdAdatto-cleared, method-independent, PRD §9.3). Live capture is P2, not this sprint.
- **Formula constants**: session-locked in `/lib/addressable-market-constants.ts` — never tune constants to hit an output target; audit logic first.
- **Box Sign**: replaces DocuSign entirely — no DocuSign at any phase.
- **NIP boundary**: never reference `kjweckggegifjmmqccul` or `gethairmd-network` in `.ts`/`.tsx`.
