# GHMD Sales Platform — Handoff v2.35

Date: 2026-07-10 | Prepared by: Chat (drafted, Coder commits) | Purpose: Close the
session-close-rule debt left open since PR #90/decision #107 — four merged PRs (#92–95) and
six decision-log entries (#109, #110, #112–115) shipped with zero handoff narrative. This is
that narrative. Supersedes v2.34.

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

## What shipped since v2.34 — the Qualification Gate & Territory-Authoring Precondition build

Authorized as a 4-PR shape under decisions **#109** (build authorization) and **#110**
(amendment adding the stage-advancement gate, `skipped_triage` deprecation, and a partial
revision of decision #53). Both logged `PLANNED`, not `ADOPTED` — they authorized the shape;
each PR was adopted individually as it merged. **3 of 4 PRs are complete; PR4 is unbriefed
and unstarted.**

- **PR1 (#92, decision #112, ADOPTED)** — Retired the 0-row `operators` /
  `operator_scores` / `operator_score_records` / `operator_enrichment` cluster. Created
  `qualification_scores` (14 dimensions), `qualification_enrichment` (incl. `practice_npi`),
  `qualification_reviews` (the gate signal: `recommendation` ∈ proceed/conditional/
  not_qualified), `rep_call_grades`. `prospects.assigned_rep_id` added as a real FK. RLS per
  scoping §5: exec-only on scores/enrichment/grades; exec-all + rep-SELECT-only on
  prospects/reviews — **after a pre-merge security fix closed a rep-cascade-delete
  exposure** caught before merge, not after.
- **PR2 (#93, decision #113, ADOPTED)** — Inserted Qualification Review as pipeline stage 5
  (11→12 stages, `pipeline-stages.ts` remains single source of truth). Deprecated
  `prospects.skipped_triage` in place — a partial revision of decision #53;
  `skipped_funding_prequal` / `call_scores` untouched. This PR's reseed triggered the
  incident resolved by the next entry.
- **Pre-PR3 hardening (#94, decision #114, ADOPTED — addendum to locked decision #94)** —
  PR2's reseed exposed that `seed-demo.ts` named its churnable demo territories identically
  to the three decision-#94-**locked** v3 QA anchor territories (Austin – Westlake / Dallas
  – Preston Hollow / Nashville – Green Hills). A non-transactional delete sequence both
  crashed (FK+CHECK collision) and, after recovery, silently deleted-and-recreated the
  anchors under new UUIDs, severing 6 decision-#94-cited job IDs' provenance link. **The
  locked figures themselves were never altered — only the row-level link.** Fixed via
  `territories.qa_locked`, which makes the anchors structurally unreachable by the seed's
  delete path (not just unlikely to collide by name). The 6 jobs were re-pointed.
  Two-reseed idempotency was proven both by Coder and independently verified via a real
  third reseed during PR3's post-merge check. **Closed, holding.**
- **PR3 (#95, decision #115, ADOPTED)** — The enforcement layer. A hard, server-side,
  non-overridable gate in `moveProspectStage` blocks advancing past Qualification Review
  without a `proceed` recommendation (boundary-crossing semantics only — already-past legacy
  fixtures like Petrov are correctly not retroactively trapped). Qualification Review UI:
  exec issues/edits the recommendation; rep reads the outcome and writes their own note via
  a **separate** `qualification_review_notes` table (chosen over column-level GRANT because
  reps and execs share one Postgres role). Minimal exec-only `rep_call_grades` entry
  surface. Two new demo prospects seeded and independently confirmed live: Dr. Osei
  (`proceed`), Dr. Zeller (`conditional`). **Territory-creation entry point confirmed not to
  exist anywhere in `src/`** — no placeholder was built; today's stage gate is the
  enforcement, and it will apply automatically whenever territory-creation UI is eventually
  built (separate future brief — see decision queue).

**Verification discipline held throughout this arc:** every PR was merged only after
independent live-state verification — diffs read directly via GitHub MCP, CI checked
directly, RLS/schema/policies queried live against Supabase, adversarial RLS tests run
fresh rather than trusting Coder's reported ones, `get_advisors` diffed before/after.
`ops.decision_log` entries were written only after merge confirmation and independent
re-verification against the live database, never from Coder's self-report alone.

## What's next — PR4

**Nav split** ("Territories" → "Deal Territories", new exec-only "Territory Scouting") is
the last PR in the 4-PR shape. **Unblocked, not yet briefed or started.** No Coder session
has received a PR4 brief as of this handoff.

## Residual risks (stated plainly)

- **v3 QA anchors still drift with Mapbox** (unchanged from v2.32/v2.33) — the isochrone
  polygon is fetched live from Mapbox on every job, never persisted/cached, so the three
  locked anchor territories remain point-in-time reference values, not strict regression
  targets. Isochrone-freeze fix proposed (#96), not built. **Note:** `TERRITORY-METHODOLOGY.md`
  §8.8 anchors are documented at a 15-minute isochrone; PR #87 (pre-existing this arc, merged
  2026-07-08) removed the 15-minute search floor from v3 sizing so territories now size to
  the smallest radius clearing the 18,600-household floor rather than starting at a fixed 15
  minutes. Whether/how this affects the §8.8 anchor values has not been re-verified this
  session — flagging as a documentation-methodology consistency check for a future session,
  not asserting a discrepancy exists.
- **390px mobile QA on authenticated pages still has no working automated path** (unchanged
  from v2.34) — chrome-devtools-mcp attached to Trace's authenticated Chrome cannot perform
  CDP viewport emulation; standalone CDP-capable browsers cannot authenticate to a
  deploy-preview host. Needs either a manual DevTools device-mode pass or a way to hand an
  authenticated session to a CDP-capable browser.
- **`qualification_reviews` / `rep_call_grades` FK cascade behavior on prospect hard-delete**
  (RESTRICT vs CASCADE) — flagged during PR1/decision #94-addendum work, still open, Trace
  call, not urgent.
- **monday.com board ID discrepancy** — `18391502210` per older Chat memory vs
  `18419216445` in `CLAUDE.md` / `docs/AGENTS.md`. Flagged 2026-07-07, still unreconciled.
- Rick Dahlson copy review (#68/#71, both `legal_flag: true`) continues to be the real gate
  on any live prospect send, independent of Hard Rule 10 build-progress status.
- Hard Rule 10 remains genuinely remediated as of decision #105 — reconfirmed via
  `get_advisors` this session, zero `rls_policy_always_true` findings. Stated here only so a
  future session doesn't need to re-derive the story from the decision log alone.

## Box Sign / Territory License Agreement scoping (decision #99 — LOCKED, legal-flagged, unchanged)

No change since v2.34. Architecture locked, build paused pending the hub-and-spoke
instrument redraft (Bruce/counsel). Reference decision #99 for the full legal analysis.

## Standing deferrals

| Item | Owner | Status |
|---|---|---|
| **PR4 — nav split** | Trace to greenlight, then Coder | Unblocked, unbriefed. |
| **Territory-creation screen mechanics** (location input, sizing-job kickoff UI) | future Coder session | Deferred, needs its own scoping brief; PR3 confirmed no placeholder exists yet. |
| **Deal Economics & Margin Tracking** | future Coder session | Deferred, needs its own scoping document. |
| **`qualification_reviews`/`rep_call_grades` FK cascade behavior** | Trace decision | Open, not urgent. |
| **390px QA tooling gap on authenticated pages** | Trace / future Coder session | No fix path identified yet. |
| **Isochrone-freeze for v3 QA anchors** | Trace to prioritize, then Coder | Unchanged — proposed (#96), not built. |
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

1. **PR4 greenlight** — nav split, unblocked, unbriefed.
2. **Isochrone-freeze follow-up** — closes the #94 residual risk. Still not picked.
3. **390px tooling gap** — needs a decision on approach, separate from any specific PR.
4. **Territory authoring/creation flow** — queued, not started.
5. **Provisioning punch-list** — Resend, Calendly still outstanding.
6. **Session E** — still unopened, still needs explicit Trace authorization.
7. **Platform RBAC** — raised 2026-07-08, still no scoping doc.
8. **FK cascade behavior** on `qualification_reviews`/`rep_call_grades` hard-delete.

**Do not assume — ask or wait for direction**, same as every prior handoff.

## Not This Session (escalate, don't creep)

Session E, isochrone-freeze, Box Sign build, Platform RBAC, territory authoring, and PR4
all remain unopened — each requires explicit Trace authorization.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable (deploy-preview QA reassigned to Coder — see `docs/AGENTS.md`) |
