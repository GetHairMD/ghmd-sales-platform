# GHMD Sales Platform — Handoff v2.28

Date: 2026-07-05 | Prepared by: Coder | Purpose: New session bootstrap — supersedes v2.27 (and v2.26)
Supersedes: v2.27. Session B (proposal system) **SHIPPED** — PR #65 merged to main, squash `246a94d`. Decision-log tip advanced to **#73**. New `docs/TERRITORY-METHODOLOGY.md` (Trace-owned) added this session. All v2.27 Security Advisor dispositions carried forward unchanged, plus one new INFO disposition for the three proposal tables.

## Current State — Exact Snapshot

| Item | State |
|------|-------|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase | `cprltmwwldbxcsunsafl` (NIP `kjweckggegifjmmqccul` — never touch) |
| Netlify | ghmdsalesplatform.netlify.app (main auto-deploys) |
| main | **`246a94d`** — even with origin/main (PRs #56–#65 merged) |
| Branch protection | main requires the `gate` status check (Second-Opinion Gate LIVE — `SECOND_OPINION_GATE_ENABLED=true`) |
| Active branch | `chore/methodology-and-handoff-v2.28` (this docs-only PR) |
| Governing docs | [`docs/prd/GHMD_Territory_Sales_OS_PRD_v1.2.md`](../docs/prd/GHMD_Territory_Sales_OS_PRD_v1.2.md) (build phasing, authoritative) + [`docs/SALES-OS-SPEC.md`](../docs/SALES-OS-SPEC.md) (proposal-system + Sales OS scope) + [`docs/TERRITORY-METHODOLOGY.md`](../docs/TERRITORY-METHODOLOGY.md) (formula v2 narrative; §8 v3 drive-time spec — Trace-owned) |
| Decision mirror | `/decisions/DECISION_LOG.md` — regenerated via `npm run log:export`; entries through **id 74** |

## What Shipped Since v2.27

| Work | PR | Result |
|------|----|--------|
| **Session B — proposal system (P1)** | **#65** | Proposal data-model migration (`20260705003707_proposal_system_p1.sql` — `proposals`, `proposal_sessions`, `proposal_events`); **`/p/[slug]` gated route live in production** (`https://ghmdsalesplatform.netlify.app/p/<slug>`); access-code gate + session logging; sections 1–5 incl. calculator + mobile demand-table treatment; idempotent `npm run seed:demo` (Dr. Elena Petrov, Austin–Westlake, real B01001 demographics, real `addressableHouseholds()` output). Squash **`246a94d63962dff602e21f4749e4dceef0851a1d`**. |
| Docs — territory methodology + handoff v2.28 | *(this PR)* | `docs/TERRITORY-METHODOLOGY.md` created (Trace-owned; formula v2 narrative + fully-specified-but-unimplemented v3 drive-time §8); handoff regen. Docs-only, no code/migration/constants change. |

## Prior sprint context (crm-demo-v1, carried for reference)

P-1 → P0 → P0.5 → P1 demo build shipped in #56–#62 (see v2.27). Session B (#65) built the real gated proposal surface on top of that foundation: three surfaces (Pipeline Board `/pipeline`, Deal Room `/prospects/[id]`) plus the public gated Proposal Page now at **`/p/[slug]`** (superseding the original `/proposals/[prospectId]` placeholder path).

## Governance Changes (decision_log) — tip = #73

Decision-log tip advanced from **#64** (v2.27) to **#73**. Session B chain:

- **#66** — Session B opened.
- **#68** — Section 4 age/sex demographic table = **Census demographics (B01001)**, carries **no propensity / clinical-demand claim**. `legal_flag: true`, **unresolved / standing**. Cross-ref Monday item `12447243443` + Rick Dahlson legal review.
- **#69** — Session B phase-close. **SUPERSEDED by #73.**
- **#71** — Section 3 revenue `scenario_outputs` (conservative/moderate/growth revenue, break-even) are **illustrative-only** — no formula-v2 producer. `legal_flag: true`, **unresolved / standing**, not PR-tied.
- **#73** — post-merge phase-close carrying the #65 squash SHA (`246a94d…`); **supersedes #69**.

**Legal boundary (standing):** neither the #68 age/sex table nor the #71 revenue scenarios may reach a real prospect or Rick Dahlson-reviewed material until its decision is resolved. Nothing in the proposal surface is an earnings representation. See `docs/TERRITORY-METHODOLOGY.md` §7.

## Netlify Environment

- **`PROPOSAL_GATE_SECRET`** — set + **secret/masked across all four contexts** (production / deploy-preview / branch-deploy / dev). Backs the `/p/[slug]` access-code gate.
- **`CENSUS_API_KEY`** — live (Edge Function / server only).
- **`NEXT_PUBLIC_MAPBOX_TOKEN`** — live (client, restricted). Note: already provisioned for the future v3 drive-time isochrone work (methodology §8.6) — **not yet used** by any deployed code.
- Box Sign vars (`BOX_CLIENT_ID` / `BOX_CLIENT_SECRET` / `BOX_WEBHOOK_SECRET`) still **not set** — pending provisioning (unchanged).

## `docs/TERRITORY-METHODOLOGY.md` — new this session

- **Session bootstrap fetch item resolved** — the methodology doc now exists in-repo and is authoritative, superseding all uploaded/offline copies.
- **Sole owner: Trace.** Any change to formula terms, thresholds, sources, or QA anchors is a Trace decision → PR → `ops.decision_log` entry (§9). Not a Coder call.
- Documents **formula v2** (current, implemented): households × income-qualified share (ACS B19001, ZCTA, straddle interpolation) × credit-eligible share (Experian state CSV). **No prevalence term** (decision #46). QA anchors (v2/ZCTA): national **69.6M** @ PTI8, **56.3M** @ PTI5, Marin County **exactly 64,194**.
- **§8 documents a fully-specified v3 drive-time boundary methodology — NOT implemented.** Nothing in §8 is live in `lib/addressable-market-constants.ts` or any deployed code. Decided: isochrone **replaces** ZCTA/county as the boundary; dynamic sizing to the smallest radius clearing **93 customers** (`CUSTOMERS_NEEDED 62 × 1.5` buffer — provisional, recalibrate after first v3 cohort) at the **Conservative (0.5%) penetration rate** (floor of 18,600 qualified households); **45-minute maximum radius**; **first-territory-sold overlap precedence**. **Only remaining open item: minimum radius floor (deferred, non-blocking).** v3 is **scoping-ready** pending Trace's explicit go-ahead to open that work — **not scheduled this handoff**, and distinct from Session C.

## Sessions — status

- **Session B — SHIPPED** (#65). Nothing open.
- **Session C is NOT open.** Next logical scope per `docs/SALES-OS-SPEC.md` §11 (sections 6–19, Wistia + Calendly, scarcity repeat, full event instrumentation) — requires **explicit Trace authorization** after this handoff lands. **Distinct and unrelated** to the §8 v3 drive-time methodology work above (that is a separate future Coder scoping session, also pending explicit Trace go-ahead).

## Open Blockers

**None carried forward.** Session B shipped; no phase blocker open.

- **Monday.com item `12447243443`** — "Patient-mix data pull + Rick Dahlson legal review" — **open, Stuck.** Cross-ref decision **#68** (age/sex table legal disposition). Not a code blocker; gates live prospect sends via Hard Rule 10.
- **Disregard the pre-resolution Pilot QA output** dispatched during the page mis-load confusion — **unverified, not a defect list.** Do not treat it as a work queue.

## STOP POINTS — status

1. **P-1 / P0 / P0.5 / P1 demo** — **CLEARED** (v2.27).
2. **Session B → proposal system** — **CLEARED** this session (#65 merged; `/p/[slug]` live in production).
3. **Session C** — **NOT opened.** Requires explicit Trace authorization (SALES-OS-SPEC §11).
4. **v3 drive-time methodology (§8)** — **scoping-ready, NOT opened.** Requires explicit Trace go-ahead for a dedicated Coder scoping session.

## Security Advisor Status (last `get_advisors` security run — 2026-07-04, carried forward + one addition)

Standing findings and their dispositions. None is an open task this session.

- **`proposals`, `proposal_sessions`, `proposal_events` RLS-enabled-no-policy** — INFO [lint 0008]. **Intentional — service-role-only by design (new this session, Session B).** Same pattern as the operator tables below; the `/p/[slug]` route and event logging use the service role, no anon/authenticated policy needed.
- **Always-true RLS on 7 tables** (`activities`, `call_scores`, `deals`, `outreach_touches`, `prospects`, `spoke_candidates`, `territories`) — WARN [lint 0024]. **Accepted per decision #58**; deferred to the role-isolation design. Not a patch to make now.
- **4 operator tables RLS-enabled-no-policy** (`operators`, `operator_enrichment`, `operator_scores`, `operator_score_records`) — INFO [lint 0008]. **Intentional per decision #58** (service-role-only by design).
- **`gate_decision_for_pr` anon-execute** — WARN [lint 0028]. **ACCEPTED as intentional — Trace ruling 2026-07-04. NOT fixed / no migration.** SECURITY DEFINER function returns a narrow projection (`id, residual_risk, status`) for one repo+PR; `anon` cannot read `ops.decision_log`. `run-gate.ts` calls it via `SUPABASE_ANON_KEY`; revoking `anon` would fail the required `gate` check closed on every PR. Revisit only via a dedicated scoped CI role (out of scope).
- **CI `gate` fail-open** — `gate_decision_for_pr` returns **empty (green)** when no decision-log row exists for the repo+PR. **Low urgency** (Trace is sole merger, so no un-reviewed merge can slip through); flagged as future housekeeping PR, not actioned this session.
- **Leaked password protection** — CLOSED 2026-07-04 (Pro upgrade; leaked-password check on; min length 6→8 + complexity). Confirmed cleared.
- **`rls_auto_enable()` anon-/authenticated-executable SECURITY DEFINER** — WARN [lint 0028/0029]. **ADOPTED per decision #64 (`residual_risk = accepted`). Confirmed inert — NOT fixed / no migration.** `event_trigger` return type makes it non-invocable regardless of the EXECUTE grant. Two optional low-priority cleanups noted (safe REVOKE; untracked-migration reconciliation), neither required, neither actioned.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops (Drive, Supabase console, Monday.com); owns `ops.decision_log` writes |
| Coder | git + schema + code + migrations (local, fresh context each session) |
| Pilot | GitHub UI + browser tasks (no terminal access) |
