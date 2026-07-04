# GHMD Sales Platform — Handoff v2.27

Date: 2026-07-04 | Prepared by: Coder | Purpose: New session bootstrap — supersedes v2.26
Supersedes: v2.26 (one-bullet correction — the `rls_auto_enable()` advisor bullet under **Security Advisor Status** updated to reflect decision #64, ADOPTED / `residual_risk = accepted`; confirmed inert, no fix applied. All other v2.26 content carried forward unchanged).

## Current State — Exact Snapshot

| Item | State |
|------|-------|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase | `cprltmwwldbxcsunsafl` (NIP `kjweckggegifjmmqccul` — never touch) |
| Netlify | ghmdsalesplatform.netlify.app (main auto-deploys) |
| main | **`936aa82`** — even with origin/main (PRs #56–#62 merged) |
| Branch protection | main requires the `gate` status check (Second-Opinion Gate LIVE — `SECOND_OPINION_GATE_ENABLED=true`) |
| Active branch | `chore/handoff-v2.27` (this docs-only handoff correction) |
| Governing docs | [`docs/prd/GHMD_Territory_Sales_OS_PRD_v1.2.md`](../docs/prd/GHMD_Territory_Sales_OS_PRD_v1.2.md) (build phasing, authoritative) + [`docs/SALES-OS-SPEC.md`](../docs/SALES-OS-SPEC.md) (proposal-system + Sales OS scope, Session B onward) |
| Decision mirror | `/decisions/DECISION_LOG.md` — regenerated via `npm run log:export`; entries through **id 64** |

## What Shipped Since v2.25

| Work | PR | Result |
|------|----|--------|
| P-1 → P0.5 foundation | #56–#60 | Reconciliation commit (#56); brand tokens → `src/design/tokens.ts` + Tailwind + Storybook §4.3 foundation components (#57); `ops.decision_log` sole-write-path governance — Chat only (#58); M0 baseline migration + M0.5 designations — `deals.stage` deprecation, `call_scores` = Salesperson Scorecard (#59); decision-log migration restore + stale table-comment fix (#60). |
| P1 demo build — all three surfaces | #61 | Pipeline Board (6 grouped columns + priority list + metric strip), Deal Room (3-column command center), Proposal Page (brand quality) on seeded data; idempotent seed script (every stage + one stalled + TRIAGE SKIPPED + PRE-QUAL SKIPPED). Squash **861e043**. |
| StageSelector gate parity + spec reconciliation | #62 | Deal Room `StageSelector` routed through the shared `moveProspectStage` server action + `ConfirmDialog` so **both** soft gates (triage → Proposal Sent, funding pre-qual → Contract Sent) record skips **server-side** — closed the residual on `ops.decision_log` **id 60**. `docs/SALES-OS-SPEC.md` committed (previously repo-invisible; now carries the PRD-precedence governance line at its top). Squash **936aa82**. |

## Current Sprint — crm-demo-v1

**Mission:** Build the Territory Sales OS front-end per PRD v1.2 — three surfaces (Pipeline Board `/pipeline`, Deal Room `/prospects/[id]`, public Proposal Page `/proposals/[prospectId]`), modified **in place**, demo-grade on seeded data.

**Scope: P-1 → P0 → P0.5 → P1 — all SHIPPED.** Nothing beyond P1 this sprint.

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **P-1** | Reconciliation commit (docs-only) | **SHIPPED** (#56) |
| **P0** | Brand tokens → `src/design/tokens.ts` + Tailwind + Storybook foundation components (PRD §4.2–4.3) | **SHIPPED** (#57) |
| **P0.5** | M0 baseline migration + M0.5 designations (`deals.stage` deprecation, `call_scores` = Salesperson Scorecard) | **SHIPPED** (#59, restore/fix #60) |
| **P1** | DEMO: board + Deal Room + Proposal Page + idempotent seed script | **SHIPPED** (#61); gate-parity + spec follow-up (#62) |

## Governance Changes (decision_log)

- Decision mirror now runs **through id 61**. **#60** (Deal Room / StageSelector gate-bypass residual) and **#61** (PR #62 phase-close) both closed with `residual_risk = none`.
- **#58 — `ops.decision_log` sole write path is Chat.** Neither Coder nor any subagent writes to `ops.decision_log`; Coder reports entry content (status, `residual_risk`, `related_pr`, `related_repo`) + squash SHA to Chat, which appends. RLS unchanged (service_role only). Append-only, supersede-never-delete.
- **#53 — PRD v1.2 ADOPTED** (⚖ legal flag): `deals` demoted to Territory Agreement record; **`deals.stage` DEPRECATED**; soft triage gate at 4→5 (`skipped_triage` flag + amber badge, mirrors funding-prequal pattern); `call_scores` designated **Salesperson Scorecard**; routes modified in place (no `/demo/*`).
- Gate-decision anon-execute disposition (this session): see **Security Advisor Status** — Trace ruled *accept as intentional*; Chat to record at phase close if a formal entry is wanted.

## Hard Constraints (PRD §12)

- Stage constants only via `src/lib/pipeline-stages.ts`; formula constants only via `/lib/addressable-market-constants.ts`; prospect creation only via `src/lib/prospect-insert.ts`.
- Frontend **reads** state, never computes it; all gates + skip-recording server-side (both soft gates now enforced server-side via `moveProspectStage` from both the Pipeline Board drag-drop and the Deal Room selector).
- RLS on every table from creation. Squash-merge only, feature branch + PR, no direct push to main. Second-Opinion Gate every category-2+ PR. Every phase-close decision-logged with explicit `residual_risk`.
- Read the frontend-design skill + brand package before any UI work — planning-PDF navy/teal mockups are **NOT** the target.

## STOP POINTS — status

1. **P-1 PR → Trace review** — **CLEARED** (shipped #56).
2. **P0 → logo files from Trace** — **CLEARED** (P0 shipped #57).
3. **End P1 → Trace design review** — **CLEARED** this session (Trace design review of the P1 demo passed; #61/#62 merged).

**Session B has NOT been scoped or opened.** Its content (proposal access gate, `/p/[slug]`, `proposal_events` / analytics, calculator, Wistia/Calendly, scarcity banner) is deliberately not pre-planned here. Do not presume its shape until Trace opens it.

## Open Blockers

**None carried forward.** P-1/P0/P0.5/P1 all shipped; no phase blocker is open. (The v2.25 P-1 blocker — orchestration skill / `implementer` / `sweeper` agent bodies "text not included" — is resolved: `.claude/skills/ghmd-orchestration/` loads and the agent types are available.)

## Security Advisor Status (last `get_advisors` security run — 2026-07-04)

Standing findings and their dispositions. None is an open task this session.

- **Always-true RLS on 7 tables** (`activities`, `call_scores`, `deals`, `outreach_touches`, `prospects`, `spoke_candidates`, `territories`) — WARN [lint 0024]. **Accepted per decision #58**; deferred to the Session B role-isolation design. Not a patch to make now.
- **4 operator tables RLS-enabled-no-policy** (`operators`, `operator_enrichment`, `operator_scores`, `operator_score_records`) — INFO [lint 0008]. **Intentional per decision #58** (service-role-only by design).
- **`gate_decision_for_pr` anon-execute** — WARN [lint 0028]. **ACCEPTED as intentional — Trace ruling 2026-07-04. NOT fixed / no migration.** The `anon` EXECUTE grant is a deliberate least-privilege control for the **live** CI Second-Opinion Gate: the SECURITY DEFINER function returns a narrow projection (`id, residual_risk, status`) for one repo+PR and `anon` cannot read `ops.decision_log`. `run-gate.ts` calls it via `SUPABASE_ANON_KEY`; revoking `anon` would fail the required `gate` check closed on every PR. Revisit only via a dedicated scoped CI role (out of current scope). *(Chat to log at phase close if a formal decision_log entry is wanted.)*
- Leaked password protection — CLOSED 2026-07-04. Supabase project upgraded to Pro; "Prevent use of leaked passwords" enabled; minimum password length raised 6→8 with full complexity requirements. Confirmed cleared via fresh get_advisors scan.
- **`rls_auto_enable()` anon- and authenticated-executable SECURITY DEFINER** — WARN [lint 0028/0029]. **ADOPTED per decision #64 (`residual_risk = accepted`). Investigated, confirmed inert — NOT fixed / no migration.** The function is an `event_trigger` handler: its `event_trigger` return type makes it non-invocable by any caller regardless of the EXECUTE grant (event-trigger functions fire only on DDL events and can never be called directly), so the `anon`/`authenticated` EXECUTE grant cannot be exercised. Verified independently by Chat against the live DB. Two optional low-priority cleanups noted, neither required: (1) a safe `REVOKE` of the `anon`/`authenticated` EXECUTE grant — advisor-noise suppression only, no security effect; (2) reconciliation of the untracked migration behind this function — bundle with future baseline-hygiene work. Neither actioned this session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops (Drive, Supabase console, Monday.com); owns `ops.decision_log` writes |
| Coder | git + schema + code + migrations (local, fresh context each session) |
| Pilot | GitHub UI + browser tasks (no terminal access) |
