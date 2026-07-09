# GHMD Sales Platform — Handoff v2.33

Date: 2026-07-09 | Prepared by: Chat (drafted, Coder commits) | Purpose: Narrative update
covering PRs #86–#88 and decisions #101–#106. Supersedes v2.32.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open PRs, and
> security-advisor status are derived live at every session start (git, `ops.decision_log`,
> `get_advisors`). This handoff carries narrative only. If a state fact appears below, it is
> illustrative context as-of the handoff date, not a source of truth.

## Stable identifiers (these do not drift)

| Item | Value |
|------|-------|
| Repo | `GetHairMD/ghmd-sales-platform` |
| Supabase project | `cprltmwwldbxcsunsafl` (ghmd-sales-platform) — NIP `kjweckggegifjmmqccul` is a separate production system, **never touch** |
| Netlify | `ghmdsalesplatform.netlify.app` (main auto-deploys) |

## What shipped since v2.32

- **PR #86** (`92960b0`) — Hard Rule 10 RLS remediation: `internal_users` allow-list table,
  swapped the 7 blanket `authenticated_all`/`authenticated_full_access` policies for
  allow-list-gated policies on the 4 rep-facing tables, dropped policies outright on the 3
  server-only tables (fail-closed). Second-Opinion Gate BLOCK, manually accepted, logged as
  decision #101 — **but the migration was merged to git and never actually applied to the
  live database.** See the correction note below; this is the most important governance
  event of this stretch.
- **PR #87** (`e733326`) — removed the 15-minute search floor from v3 sizing; territories
  now size to the smallest drive-time radius that clears the 18,600-household floor, rather
  than starting the search at a fixed 15 minutes.
- **PR #88** (`d270bbb`) — v3 UI wiring session 1: executive-gated sizing/approve controls
  on `territories/[id]` (role gate via `internal_users`), addressable-vs-18,600 headline +
  single-ring boundary map for approved v3 (zero drive-time-minute values anywhere on a v3
  surface, AC2), `POST /api/territories/[id]/approve` persisting the boundary as EWKT, and a
  read-only Lead-profile Territory artifact on `prospects/[id]`. Closes #102 items 2–3.
  Logged as decision #106.

## The Hard Rule 10 gap — what happened and why it matters going forward

Decision #101 (2026-07-08) logged the RLS remediation as `ADOPTED` on the strength of PR #86
merging to main. That was correct about the code, wrong about the database: the migration
file was committed but never pushed to `cprltmwwldbxcsunsafl`. Chat caught this independently
during PR #88 QA prep (2026-07-09) — not from Coder's report, from checking
`list_migrations`, `to_regclass('public.internal_users')`, and `pg_policies` directly — and
it's also exactly why PR #88's exec gate initially came back BLOCKED in QA: `internal_users`
didn't exist, so `getViewerDesignation()` correctly failed closed to the rep view for
everyone, including the signed-in executive.

Coder applied the already-merged, already-reviewed migration file as a deploy action (no new
migration, no re-review needed), and Chat independently re-verified every claim before
logging the correction as decision #105: `internal_users` exists and is seeded, all 4
rep-facing tables carry `internal_users_all`, the 3 server-only tables carry zero policies,
and a fresh `get_advisors` scan shows zero `rls_policy_always_true` findings. **Hard Rule 10
is now genuinely remediated, not just logged as remediated.**

**The lesson, stated plainly for future sessions:** a merged migration file is not the same
claim as an applied migration. Decision-log entries about database state should be written
from `list_migrations`/live-schema verification, not from PR-merge status alone. This
distinction wasn't sloppy — the design was correct and the gate process worked as intended —
but the gap between "code merged" and "deployed" sat undetected in the decision log for a
full day. Treat any future RLS/schema-remediation decision the same way: verify against the
database, not the git history, before logging `ADOPTED`.

## What shipped in PR #88, QA-verified

Live QA against a Chat-seeded fixture territory (`2f89fe9e-eedf-49b0-bd5a-2e866a4651e4`,
"Metairie, LA — QA Fixture (v3 UI)") confirmed the full exec-gated flow works end to end:
exec sees the sizing panel (not the rep fallback), live sizing returned VIABLE at 19,038
addressable households / 9-minute boundary, the preview and approved states both render with
zero drive-time-minute values anywhere, `sold_boundary_geom` is untouched by approve, and v2
territories (spot-checked on Austin–Westlake) are pixel-unchanged. The fixture is now
deleted — see Part 2 of this PR.

One accepted, non-blocking behavior change from #88: a `formula_version=2` territory with no
addressable number now shows "Pending internal review" for reps instead of auto-recomputing
the county census figure on load. No live impact today (all production territories have
numbers); aligns with the v3-forward direction.

One accepted, non-blocking pre-existing finding surfaced during #88 QA: React hydration
errors (#418/#423/#425, locale date/time SSR mismatch) on the prospect page. Confirmed
pre-existing, not a #88 regression — production running pre-#88 code throws the identical
error set. Not yet ticketed; do so on next touch of that page.

## Box Sign / Territory License Agreement scoping (decision #99 — LOCKED, legal-flagged, unchanged)

No change since v2.32. Architecture locked, build paused pending the hub-and-spoke
instrument redraft (Bruce/counsel). Reference decision #99 for the full legal analysis.

## Residual risks (stated plainly)

- **v3 QA anchors drift with Mapbox (from #94).** Unchanged from v2.32 — the isochrone
  polygon is fetched live from Mapbox on every job, never persisted/cached, so the three
  locked anchor territories are point-in-time reference values, not strict regression
  targets. Isochrone-freeze fix proposed (#96), not built.
- **390px mobile QA on authenticated pages has a real tooling gap, discovered during #88
  QA.** Coder's chrome-devtools-mcp session (attached to Trace's authenticated Chrome via
  extension) cannot perform CDP viewport emulation — `resize_window` does not reflow the
  rendered viewport for an extension-attached tab. The browsers that can emulate
  (chrome-devtools/playwright standalone) cannot authenticate to a deploy-preview host.
  Net effect: **390px QA on any page that requires sign-in currently has no working
  automated path.** This needs either a manual DevTools device-mode pass by Trace, or a way
  to hand an authenticated session to a CDP-capable browser — genuinely unsolved, not just
  undone. PR #88 merged with this item open (item 7 of its QA checklist), tracked as a
  standing gap, not a regression.
- **Hard Rule 10 is now genuinely remediated** (see above) — this is no longer a residual
  risk, but is stated here so a future session doesn't need to re-derive the story from the
  decision log alone.
- Rick Dahlson copy review (#68/#71) continues to be the real remaining gate on any live
  prospect send — unrelated to #88, unchanged.

## Standing deferrals

| Item | Owner | Status |
|---|---|---|
| **390px QA tooling gap on authenticated pages** | Trace / future Coder session | New this handoff — see residual risks. No fix path identified yet. |
| **Isochrone-freeze for v3 QA anchors** | Trace to prioritize, then Coder | Unchanged — proposed (#96), not built. |
| **Box Sign / Territory License Agreement** | Bruce / counsel, then Coder | Unchanged — paused per #99. |
| **`docs/AGENTS.md` capability-stack + Review SOP codification** | Trace to dispatch | Drafted, reviewed by Trace, ready to send to Coder as a standalone docs-only PR. Not yet dispatched as of this handoff. |
| **Functional global search** (TopBar) | future Coder session | Unchanged — dead field by design. |
| **Repo-wide token-lint broadening** | future Coder session | Unchanged. |
| **PRD v1.2 embedded-signing reference** | next PRD touch | Unchanged — still says "Box spike → embedded signing," stale vs #99. |
| **Prospect-page hydration errors** (#418/#423/#425) | future Coder session | New this handoff — pre-existing, confirmed not a #88 regression, not yet ticketed. |
| Resend provisioning | Trace, manual, off-transcript | Unchanged. |
| Calendly Phase 1 provisioning | Trace, manual, off-transcript | Unchanged. |
| Proposal generator send-copy claims review | Trace / Rick Dahlson | Unchanged — blocks any real prospect send. |
| `hausauerghmd` clone retirement | Trace | Unchanged. |
| `reserved_for` dead column retirement | future Coder session | Carried from #88's PR body — NULL on all rows, superseded by `deals.territory_id`. |
| Re-size-panel cosmetic follow-up (approved v3 territory) | future Coder session | New this handoff — re-size panel auto-resumes into a live second Approve control instead of sitting idle. Idempotent, not a data defect. |

## Decision needed next session

1. **Dispatch the `docs/AGENTS.md` capability-stack + Review SOP brief.** Drafted, Trace-reviewed, ready.
2. **Isochrone-freeze follow-up** — closes the #94 residual risk. Still Chat's recommendation; still not picked.
3. **390px tooling gap** — needs a decision on approach (manual pass vs. new automation path), separate from any specific PR.
4. **Territory authoring/creation flow** — queued (referenced as "Brief 3" in recent session notes), not started.
5. **Provisioning punch-list** — Resend, Calendly still outstanding.
6. **Session E** — still unopened, still needs explicit Trace authorization.
7. **Platform RBAC** — raised 2026-07-08, still no scoping doc.

**Do not assume — ask or wait for direction**, same as every prior handoff.

## Not This Session (escalate, don't creep)

Session E, isochrone-freeze, Box Sign build, Platform RBAC, and territory authoring all
remain unopened — each requires explicit Trace authorization.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
