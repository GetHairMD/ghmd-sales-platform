# GHMD Sales Platform — Handoff v2.32

Date: 2026-07-08 | Prepared by: Coder (docs-only PR, Chat-reviewed before merge) | Purpose: Structural fix — the handoff is redefined as **narrative-only**. Supersedes v2.31.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and security-advisor status are derived live at every session start (git, `ops.decision_log`, `get_advisors`). This handoff carries narrative only: what shipped and why, judgment calls, residual risks, deferrals, and the decision queue. If a state fact appears below, it is illustrative context as-of the handoff date, not a source of truth.

## Why v2.32 exists (the structural change)

Every prior handoff duplicated volatile state facts — main SHA, decision-log tip, active branch, advisor status — whose authoritative sources are git, `ops.decision_log`, and `get_advisors`. A static copy of a moving fact starts dying at the next merge, and v2.31 proved it: it stated main at `997fe41` and decision tip #94, but main moved through PRs #80–#84 and the decision log moved to #99 before anyone re-read it. This was a recurring structural failure, not a discipline lapse. v2.32 stops carrying those facts at all. Bootstrap derives them live; the handoff carries only what git and the log can't tell you — the story.

## Stable identifiers (these do not drift)

| Item | Value |
|------|-------|
| Repo | `GetHairMD/ghmd-sales-platform` |
| Supabase project | `cprltmwwldbxcsunsafl` (ghmd-sales-platform) — NIP `kjweckggegifjmmqccul` is a separate production system, **never touch** |
| Netlify | `ghmdsalesplatform.netlify.app` (main auto-deploys) |

Advisor status is derived live each session via `get_advisors`; standing adjudications live in `ops.decision_log` (#64, #92) and are not re-litigated here.

## What shipped since v2.31

- **PR #80** — handoff v2.31 itself. Docs-only.
- **PR #81** — regenerated the `decisions/DECISION_LOG.md` git mirror against `ops.decision_log` via the sanctioned `scripts/export-decision-log.ts`, bringing it current from its stale-behind-#78 state to 75 entries (through the isochrone-freeze proposal that follows #94). Docs-only, generated file. The PR also flagged — but deliberately did not fix — that `npm run log:export` does not preload `.env.local`, so the documented command fails as written unless run with `tsx --env-file=.env.local`. That mirror is now permanently frozen (see the deferrals note and the frozen banner atop the file itself); the tooling gap is moot going forward.
- **PR #82** (`bee2d51`) — retired the legacy `SPRINT-STATE.md` tracker. Decision #97. Sprint status now lives only in this handoff, read fresh each session.
- **PR #83** (`94d9338`) — gitignored local Box AI agent skill tooling. Decision #98. Box's `box-for-ai` Claude Code skill package was installed locally and trimmed to the base "box" skill only; all of it is kept out of the repo.
- **PR #84** (`59719a4`) — CLAUDE.md documentation: added Commands + Repo Layout sections and corrected the serverless-compute references from "Edge Functions" to "Netlify Functions" (the repo has no Supabase Edge Functions). Docs-only.

## Box Sign / Territory License Agreement scoping (decision #99 — LOCKED, legal-flagged)

Architecture is locked; **the build is paused.** No Coder build session was opened — no code, no Box template, no provisioning. What was decided:

- Signing trigger is **decoupled from the stage transition** — an explicit server action fires at `CONTRACT_SENT`, not as a side effect of the pipeline move.
- **Hosted signing, not embedded.**
- **Sequential signing** via Box's native order field: doctor at order 0, GHMD executive at order 1.
- **CCG auth** via `box-node-sdk`.
- **A single parent-folder webhook** with **dual-key HMAC** signature verification.
- The **Territory Map (Exhibit C)** is an upstream, per-deal merge step — **not** a `prefill_tags` problem.
- Signing entity confirmed as **Get Hair MD, LLC**.
- **Spoke economics are excluded** from the base agreement.

**Why paused:** the build is blocked pending a hub-and-spoke instrument redraft — six absent instruments, with the royalty-split ratio pending Bruce. Contract-level findings (Kwak agreement §7.2/7.3 termination defects, the spoke-reservation clause) are queued for counsel. Reference decision #99 for the full legal analysis — it is not restated here. The pause is on the legal instruments, not on any platform work.

## Residual risks (stated plainly)

- **v3 QA anchors drift with Mapbox (from #94).** The three locked anchor territories (Austin – Westlake, Dallas – Preston Hollow, Nashville – Green Hills) reproduce exactly across independent production runs, but the isochrone polygon is fetched live from Mapbox on every job (`cache: 'no-store'`, never persisted). If Mapbox re-graphs the roads around a practice, the same 15-minute isochrone can enclose a different set of block groups and the anchor figure can move with no code change. That is why #94 locks these as **point-in-time reference values, not strict pass/fail regression targets**. The isochrone-freeze fix that would close this is proposed, not built, not authorized (see decision queue).
- **Hard Rule 10 continues to block any live prospect send** regardless of feature progress — proposal generator send-copy still needs Trace / Rick Dahlson review.

## Standing deferrals

| Item | Owner | Status |
|---|---|---|
| **Isochrone-freeze for v3 QA anchors** | Trace to prioritize, then Coder | Proposed as the fix for the #94 residual risk. Not built, not authorized. Chat's recommended next track. |
| **Box Sign / Territory License Agreement** | Bruce / counsel, then Coder | Paused per #99, blocked on hub-and-spoke redraft (Bruce/counsel), **not on any platform work**. |
| **390px mobile visual QA** — `/dashboard`, `/proposals`, generator panel | Pilot, on deploy-preview | Still not done. Natural pairing with resolving #88 (mobile bottom-tab count) in the same live look. |
| **Functional global search** (TopBar) | future Coder session | Dead field by design; needs a full brief before wiring. |
| **Repo-wide token-lint broadening** | future Coder session | Lint rule still scoped only to `src/components/proposal/**` and `src/app/p/**`. |
| **PRD v1.2 embedded-signing reference** | next PRD touch | `docs/prd/GHMD_Territory_Sales_OS_PRD_v1.2.md` still says "Box spike → embedded signing" — stale vs #99 (hosted). Correct on next PRD touch. |
| Resend provisioning | Trace, manual, off-transcript | Unchanged — still blocks live trigger emails. |
| Calendly Phase 1 provisioning | Trace, manual, off-transcript | Unchanged. |
| Proposal generator send-copy claims review | Trace / Rick Dahlson | Unchanged — blocks any real prospect send (Hard Rule 10). |
| `hausauerghmd` clone retirement | Trace | Unchanged — parity-confirmed safer, not retired. |

## Decision needed next session

Pick the next track:

1. **Isochrone-freeze follow-up** — closes the #94 residual risk. *Chat's recommendation; Trace has not yet picked.*
2. **v3 UI wiring** — territory authoring flow, proposal map, two-ring → single-ring display change (flag #8, confirmed in #89, not built). Bigger scope.
3. **390px mobile QA** — paired with #88.
4. **Provisioning punch-list** — Resend, Calendly still outstanding.
5. **Session E** — still unopened, still needs explicit Trace authorization.
6. **Platform RBAC** — raised by Trace 2026-07-08. Scoping discussion started (roles taxonomy + RLS redesign); no scoping doc yet. PRD P4 item.

**Do not assume — ask or wait for direction**, same as every prior handoff.

## Not This Session (escalate, don't creep)

Session E, v3 UI wiring, isochrone-freeze, Box Sign build, and Platform RBAC all remain unopened — each requires explicit Trace authorization (Box Sign additionally blocked on the hub-and-spoke redraft). Do not start any of them on inference.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer** |
| Coder | git + schema + code + migrations (fresh context each session) |
| Pilot | GitHub UI + browser tasks (incl. deploy-preview visual QA) |
