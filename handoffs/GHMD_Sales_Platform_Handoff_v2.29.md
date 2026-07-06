# GHMD Sales Platform — Handoff v2.29

Date: 2026-07-05 | Prepared by: Coder | Purpose: Session D close — supersedes v2.28.

**Session D (Dashboard · Triggers · Generator · Timeline) shipped across two PRs.** PR-A (#70)
merged (squash `647c4c8`). PR-B (#71) covers the generator + guarded email + parity + this handoff.
Decision-log tip is **#78** (Session D opened); PR-A's entry (Chat, ~#79) and PR-B's entry are
pending the sanctioned write path.

## Current State — Exact Snapshot

| Item | State |
|------|-------|
| Repo | GetHairMD/ghmd-sales-platform |
| Supabase | `cprltmwwldbxcsunsafl` (NIP `kjweckggegifjmmqccul` — never touch) |
| Netlify | ghmdsalesplatform.netlify.app (main auto-deploys) |
| main | **`647c4c8`** (PR-A #70 merged) |
| Branch protection | main requires the `gate` status check (Second-Opinion Gate LIVE) |
| Active branch | `feature/session-d-generator-email` (PR-B #71) |
| Governing docs | `docs/prd/GHMD_Territory_Sales_OS_PRD_v1.2.md` · `docs/SALES-OS-SPEC.md` (§§6–8,11) · `docs/TERRITORY-METHODOLOGY.md` |
| Decision mirror | `/decisions/DECISION_LOG.md` — **STALE (behind #78)**; regen blocked, see Deferred |

## What Shipped — Session D

| Item | PR | Result |
|------|----|--------|
| **D1 `/dashboard`** (§8) | #70 | 11-stage summary strip, engagement feed (NIP Recommended-Actions), hot-lead list (trigger hits, 7d) → `/prospects/[id]`. Auth-gated (middleware); service-role reads. Nav-wired. |
| **D2 trigger detection** (§7 P0) | #70 | Pure `financing_cta_click` / 3rd-session / >5min-dwell engine (`src/lib/dashboard/triggers.ts`). |
| **D4 prospect timeline** (§11) | #70 | `proposal_sessions` + `proposal_events` (incl. Calendly) + notes merged chronologically; `session_start` deduped. |
| **D5 `alignment_bullets`** (§6.7) | #70 | `proposals.alignment_bullets jsonb` — migration `20260705140000_proposals_alignment_bullets.sql` (**applied**). NULL → template default. |
| **D3 proposal generator** (§11) | #71 | Deal Room "Generate proposal" → mints unguessable slug + hashed access code + formula-v2 snapshot; one-screen ready-to-send email/SMS copy (outputs-only). Legal-flagged fields (`demand_matrix` #68 / `scenario_outputs` #71) minted **NULL** (Trace, 2026-07-05 — impl detail, no D-log entry). |
| **D2 email v1** (§7) | #71 | Guarded Resend lib (`src/lib/notify/email.ts`, `fetch`, no npm dep). `financing_cta_click` → sales-inbox alert, wired in `/p/[slug]/event`. **Guard-closed until Trace provisions Resend.** |
| **D6 parity** | #71 | `docs/PARITY-hausauerghmd.md` — in-platform superset of the clone; safer on earnings. **Retire = Trace.** |

Verification (PR-B tip): **818 tests green** (24 new), `tsc` clean, `next build` clean, `next lint` clean,
token-compliant, public-proposal guardrail intact (`/p/[slug]` bundle unchanged — no formula-import leak).

## Netlify Environment — provisioning owed by Trace (secret-handling, off-transcript)

Neither Coder nor Chat can set these (Hard Rule 6 — no key material in any tool call/log):

- **`CALENDLY_WEBHOOK_SIGNING_KEY`** — Phase 1, **not set**. Guard auto-opens with zero code change.
- **`RESEND_API_KEY` / `RESEND_FROM` / `RESEND_NOTIFY_TO`** — email v1, **not set**. `isEmailConfigured()`
  false → every send is a logged no-op until all three exist. `RESEND_FROM` needs a verified sender domain.
- Prior: `PROPOSAL_GATE_SECRET`, `CENSUS_API_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN` live. Box Sign vars still unset.

## Calendly Phase 1 — STANDING NOTE (Trace-only manual)

Signing-key provisioning (Calendly org webhook `invitee.created`+`invitee.canceled` → capture signing key →
Netlify secret env across **4 contexts** production/deploy-preview/branch-deploy/dev → verify 200-signed/
401-unsigned → **revoke PAT**) is **not executable by Chat or Coder** per Hard Rule 6. **Trace-only, dashboard-to-dashboard.**
Zero code change (guard auto-opens). Runbook is in the PR-A checkpoint record. **Status: PENDING** as of v2.29.

## Deferred (tracked, non-blocking)

| Item | Owner | Target |
|---|---|---|
| `log:export` DECISION_LOG.md mirror regen (behind #78) | Coder, next session w/ service-role env | Before further D-log reliance |
| 390px visual QA of `/dashboard` + generator | Pilot, on deploy-preview | (local is auth-gated) |
| Email for dwell/3rd-session triggers | future | needs a fired-state table to avoid repeats; v1 ships financing-click only |
| Phase 1 Calendly provisioning | Trace | standing until done |
| Resend provisioning (email v1 live) | Trace | before real trigger emails |

## Security Advisor Status (carried forward from v2.28, unchanged)

All v2.28 dispositions stand. `proposals.alignment_bullets` (new) inherits the existing
service-role-only `proposals` RLS posture — **no new advisor finding, no new policy.** The 7 always-true
RLS tables (#58), 4 operator tables (#58), `gate_decision_for_pr` anon-execute (Trace 2026-07-04),
CI `gate` fail-open, and `rls_auto_enable()` (#64) dispositions are all carried unchanged.

## Not This Session (escalate, don't creep)

Session E (Scoreboard, Community Board, Field Kit, templates, Events) and v3 drive-time methodology (§8)
remain unopened — explicit Trace authorization required.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer** |
| Coder | git + schema + code + migrations (fresh context each session) |
| Pilot | GitHub UI + browser tasks (incl. deploy-preview visual QA) |
