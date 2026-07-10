# GHMD Sales Platform — Handoff v2.36

Date: 2026-07-10 | Prepared by: Chat (drafted, Coder commits) | Purpose: Close the
4-PR Qualification Gate & Territory-Authoring Precondition arc (decisions #109/#110) with
PR4's merge. Supersedes v2.35.

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

## What shipped since v2.35 — PR4 closes the Qualification Gate arc

**PR4 (#97, decision #118, ADOPTED)** — the last PR in the 4-PR shape authorized under
decisions #109/#110. Shipped in three review rounds, not one; each round sent back rather
than accepted defensively — worth recording in detail because the pattern (structural fix
over defensive patch) is the standard this arc set, not a one-off.

- **Round 1 — the nav split itself.** Renamed "Territories" → "Deal Territories"
  (label-only, `/territories` route/data/behavior unchanged). Added exec-only "Territory
  Scouting" as a Coming Soon placeholder — not the territory-creation flow, which stays
  separately deferred and was confirmed absent from `src/` back in PR3. Gated via
  `navItemsFor(designation)`, a pure filter reusing PR3's `getViewerDesignation()` /
  `internal_users` pattern — no new role logic. `src/lib` genuinely untouched (type-only +
  reused-function imports only, independently confirmed from the diff).
- **Round 2 — sent back, not accepted.** Round 1 sourced `getViewerDesignation()` in the
  **true root layout**, which wraps every route including the public `/p/[slug]` proposal
  page — defended only by a try/catch fail-closed. Rather than accept that as a documented
  residual risk, it was sent back for a structural fix: designation-sourcing moved into a
  new `src/app/(app)` route group wrapping only internal pages (Dashboard, Pipeline,
  Prospects, Territories, the internal Proposals index). The true root layout is now
  genuinely minimal — html/body/fonts/metadata only, no auth call in its call graph at all.
  Verified via the build (`/login` flipped back to static rendering — impossible if its
  layout still read cookies) and a direct render-tree read (every
  `getViewerDesignation()` call site confined to `(app)/` or `src/lib`).
  **This round also surfaced and fixed a real pre-existing bug**, not introduced by this
  PR: `AppShell`'s old per-path `CHROMELESS_PREFIXES` guard was stripping the shell from
  the *internal* Proposals index (a rep-facing page reached from the sidebar) because it
  matched on the bare `/proposals` prefix without distinguishing it from the public
  `/proposals/[prospectId]` buyer page sharing that folder. Fixed as part of the
  route-group move.
- **Round 3 — codified, not left as a one-time check.** The chromeless-Proposals fix from
  round 2 was verified manually but not regression-tested. Sent back a third time for
  `app-shell-chrome-guardrails.test.ts` — a source-scan guardrail (repo's established
  idiom, no RTL/jsdom) asserting the internal Proposals index lives inside `(app)`, the
  legacy public buyer page stays at the shell-less root, and `AppShell` carries no
  per-path chrome-stripping mechanism, scanned comment-stripped so its own JSDoc (which
  legitimately names the retired token) can't false-pass the check.

**Verification discipline held across all three rounds, independently, not from Coder's
self-report:** each round's diff was pulled directly via GitHub MCP before the next
request went out. The regression-guardrail trip-wire claim specifically was checked by
fetching `AppShell.tsx` at both the pre-refactor commit and the final branch head directly
— confirming `CHROMELESS_PREFIXES`/`isChromeless`/`usePathname` exist as genuine executable
code in the old file and are absent (bar one JSDoc mention) in the new one, proving the new
test is a real trip-wire and not a tautology.

**Final state:** 3 commits, 33 files changed, +254/−52. Full suite 967 passing (was 956
before this arc began). Build clean, lint clean. Merged to main at `ff0ba50` (base `38d10f6`
— the v2.35 handoff commit).

## A separate, unresolved finding from this session — decision #117

While sequencing PR4's greenlight, a second and unrelated issue was investigated and
logged: **PR #87's sizing-algorithm change (removing v3's 15-minute search floor) very
likely invalidates the three decision-#94-locked v3 QA anchor territories** (Austin –
Westlake, Dallas – Preston Hollow, Nashville – Green Hills). Confirmed via code diff (the
old algorithm returned the smallest clearing probe immediately; the new one refines
downward past it) and via the stored job JSON on one locked anchor (Austin's `probes` array
shows the old single-probe-return signature). No job has re-run against any of the three
since PR #87 merged. **This is distinct from the already-known Mapbox isochrone-drift
risk** — it's a deterministic code-behavior change, not live-data non-determinism, so
"investigate before treating as regression" (decision #94's own guidance) doesn't apply;
the diff fully explains the expected discrepancy.

Logged as decision **#117, status `OPEN`** — records the gap, does not resolve it.
**Re-lock (live re-run + supersede #94) vs. documentation-only (mark #94's figures as
pre-#87 historical) is still Trace's call, not yet made.**

## Residual risks (stated plainly)

- **v3 sizing anchors — see decision #117 above.** New this session, unresolved, needs a
  Trace decision on path forward.
- **v3 QA anchors still drift with Mapbox** (unchanged, longstanding) — isochrone fetched
  live on every job, never cached. Isochrone-freeze fix proposed (#96), not built.
- **390px / authenticated deploy-preview QA still has no working automated path**
  (unchanged) — this gap directly limited PR4's own verification: the route-group refactor
  and nav-gating behavior were verified via build output, render-tree reads, and unit
  tests, but full exec-vs-rep browser verification on the live deploy-preview still
  requires Trace's authenticated session.
- **`qualification_reviews` / `rep_call_grades` FK cascade behavior** (RESTRICT vs
  CASCADE) — still open, Trace call, not urgent.
- **monday.com board ID discrepancy** — still unreconciled since 2026-07-07.
- Rick Dahlson copy review (#68/#71, `legal_flag: true`) — still the real gate on any live
  prospect send.
- Hard Rule 10 remains genuinely remediated (decision #105) — reconfirmed via
  `get_advisors` earlier this session, zero `rls_policy_always_true` findings.

## New from this arc — small, explicitly not creeped into PR4

- **`/territories` page `<h1>` still reads "Territories,"** not "Deal Territories" — a
  page heading, not the nav item, correctly out of PR4's nav-component scope. Small
  follow-up if the label mismatch matters. That line also carries a pre-existing
  `text-gray-900` raw-utility violation, left untouched.
- **The legacy public `/proposals/[prospectId]` buyer page** is now structurally
  confirmed (via the route-group split) to be exactly what its own code comments already
  said: superseded by `/p/[slug]`, never indexed, kept alive only at the shell-less root.
  Worth a retirement decision at some point, now that its isolation is structurally clean
  rather than accidental. Not urgent — noting so it surfaces as a deliberate choice next
  time it's touched, not a surprise.

## Box Sign / Territory License Agreement scoping (decision #99 — LOCKED, legal-flagged, unchanged)

No change since v2.35. Architecture locked, build paused pending the hub-and-spoke
instrument redraft (Bruce/counsel). Reference decision #99 for the full legal analysis.

## Standing deferrals

| Item | Owner | Status |
|---|---|---|
| **v3 sizing anchor reproducibility gap** (decision #117) | Trace decision | New — re-lock vs. document-only, not yet chosen. |
| **Territory-creation screen mechanics** (location input, sizing-job kickoff UI) | future Coder session | Deferred, needs its own scoping brief; PR3 confirmed no placeholder exists yet. |
| **Deal Economics & Margin Tracking** | future Coder session | Deferred, needs its own scoping document. |
| **`qualification_reviews`/`rep_call_grades` FK cascade behavior** | Trace decision | Open, not urgent. |
| **390px / authenticated deploy-preview QA tooling gap** | Trace / future Coder session | No fix path identified yet; directly limited PR4's own QA. |
| **Isochrone-freeze for v3 QA anchors** | Trace to prioritize, then Coder | Unchanged — proposed (#96), not built. |
| **`/territories` page `<h1>` label + pre-existing `text-gray-900`** | future Coder session | Small, flagged not done in PR4. |
| **Legacy public `/proposals/[prospectId]` retirement** | Trace | New — structurally isolated now, not urgent, worth a deliberate call eventually. |
| **Box Sign / Territory License Agreement** | Bruce / counsel, then Coder | Unchanged — paused per #99. |
| **Functional global search** (TopBar) | future Coder session | Unchanged — dead field by design. |
| **Repo-wide token-lint broadening** | future Coder session | Unchanged. |
| **PRD v1.2 embedded-signing reference** | next PRD touch | Unchanged — still says "Box spike → embedded signing," stale vs #99. |
| **Prospect-page hydration errors** (#418/#423/#425) | future Coder session | Pre-existing, confirmed not a #88 regression, not yet ticketed. |
| **monday.com board ID discrepancy** | Trace | Unreconciled since 2026-07-07. |
| Resend provisioning | Trace, manual, off-transcript | Unchanged. |
| Calendly Phase 1 provisioning | Trace, manual, off-transcript | Unchanged. |
| Proposal generator send-copy claims review | Trace / Rick Dahlson | Unchanged — blocks any real prospect send. |
| `hausauerghmd` clone retirement | Trace | Unchanged. |
| `reserved_for` dead column retirement | future Coder session | NULL on all rows, superseded by `deals.territory_id`. |
| Re-size-panel cosmetic follow-up (approved v3 territory) | future Coder session | Idempotent, not a data defect. |

## Decision needed next session

1. **v3 sizing anchor gap (#117)** — re-lock via live re-run, or document-only. Newest, needs a call.
2. **Isochrone-freeze follow-up** — closes the #94 residual risk. Still not picked.
3. **390px / authenticated-preview tooling gap** — needs a decision on approach.
4. **Territory authoring/creation flow** — queued, not started.
5. **Provisioning punch-list** — Resend, Calendly still outstanding.
6. **Session E** — still unopened, still needs explicit Trace authorization.
7. **Platform RBAC** — raised 2026-07-08, still no scoping doc.
8. **FK cascade behavior** on `qualification_reviews`/`rep_call_grades` hard-delete.
9. **Legacy public proposals page retirement** — not urgent, worth a deliberate call.

**Do not assume — ask or wait for direction**, same as every prior handoff.

## Not This Session (escalate, don't creep)

Session E, isochrone-freeze, Box Sign build, Platform RBAC, territory authoring, the v3
anchor re-lock decision, and legacy-proposals retirement all remain unopened — each
requires explicit Trace authorization.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable (deploy-preview QA reassigned to Coder — see `docs/AGENTS.md`) |
