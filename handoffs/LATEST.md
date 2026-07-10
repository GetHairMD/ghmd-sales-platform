# GHMD Sales Platform — Handoff v2.38

Date: 2026-07-10 | Prepared by: Coder at session close (docs/AGENTS.md session-close rule),
for Chat/Trace review | Purpose: capture the governed-row DB write guards (PR #104,
decisions #124/#125/#126) and the resolution of the v3 anchor situation (decision #127
supersedes #94, addresses #117). Supersedes v2.37.

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

## State as of this handoff (illustrative — verify live)

- Main HEAD `8bdcc69` (PR #104 squash-merge). Decision-log tip: **#127**. Open PRs: the v2.38
  handoff/methodology PR itself (this one); otherwise 0.

## What shipped since v2.37

### 1. Governed-row DB write guards — PR #104, decisions #124/#125/#126, merged `8bdcc69`

The durable DB-level remediation of the RLS-bypass write pattern (the Nashville-incident root
class, scoped in PR #102 / decision #123). The animating fact: **`service_role` bypasses RLS
but not triggers**, so `BEFORE UPDATE`/`BEFORE DELETE` triggers are the only mechanism that
catches every write path — service-role background jobs, authenticated sessions, and future
call sites nobody has written yet. One migration, four pieces on `public.territories`:

- **qa_locked UPDATE immutability** (#124) — a locked row rejects every UPDATE except the
  unlock-only transition (`qa_locked true→false`, no other column changed), via a
  geometry-safe, schema-evolution-proof jsonb row-compare.
- **qa_locked DELETE guard** (#126) — a locked row also rejects every DELETE, closing the
  delete+recreate anchor-loss vector. No new escape hatch: unlock first (the #124 UPDATE
  hatch), then delete the now-unlocked row.
- **RLS UPDATE tightening** (#124) — a RESTRICTIVE `WITH CHECK (qa_locked=false)` policy
  layered on the untouched permissive `internal_users_all`; makes row-locking service-role-only.
- **`sold_boundary_geom` value-scoped freeze** (#125) — once set, the frozen sold boundary is
  immutable regardless of status; sole escape hatch is a direct admin session
  (`current_user='postgres'`) that has set the `app.sold_boundary_override` GUC.

**The ultrareview arc is the story worth carrying.** The dedicated adversarial pass caught that
the *original* status-scoped `sold_boundary_geom` design (freeze while `status IN
('sold','reserved')`) was bypassable by an un-sell → edit → re-sell round-trip; escalated to
Trace, hardened to value-scoped via **#125**. A second adversarial pass then caught the
delete+recreate symmetry gap (UPDATE was guarded, DELETE was not); closed via **#126**. Both
findings were closed *before* merge, in the same PR. All three trigger functions pin
`search_path=''` (get_advisors clean). Verified against real UPDATE/DELETE attempts from
`postgres`, `service_role`, and `authenticated` clients; reproducible battery lives at
`supabase/tests/governed_row_write_guards.test.sql`.

### 2. v3 anchor situation resolved — decision #127 (ADOPTED), supersedes #94

v2.37 left the #94/#117 anchor re-run *done but unwritten* (job data verified, supersession and
the §8.8 doc update outstanding). Both are now closed. Decision **#127** records the re-run
under the current engine (post-#87 floor removal / post-#120 clamp) and **supersedes #94**;
`ops.decision_log` #94 now carries `superseded_by = 127`. The current anchor figures:

| Territory | Addressable (VIABLE) | Drive-time |
|---|---|---|
| Austin – Westlake | 27,978.39 | 13 min |
| Dallas – Preston Hollow | 19,141.31 | 9 min |
| Nashville – Green Hills | 21,420.60 | 14 min |

`TERRITORY-METHODOLOGY.md` **§8.8** is updated to these figures in *this same PR* (piece 2),
citing #127, with the old 15-minute #94 figures (59,699.47 / 120,318.47 / 33,969.31) retained
as clearly-marked superseded provenance. The point-in-time-reference caveat and the
Mapbox-drift-before-code-regression discipline carry forward unchanged onto the new numbers.
The anchor **rows themselves are untouched** — still `qa_locked=true`, `status='available'`,
`updated_at` unchanged since 2026-07-09 (verified live this session), and now protected by the
PR #104 triggers.

## Standing queue — reprioritized

v2.37 items 1 (decision #123 six flags) and 2 (#94 supersession + §8.8) are **both done** — via
PR #104 (#124/#125/#126) and decision #127 + this PR respectively. Remaining, renumbered:

| Priority | Item | Owner | Status |
|---|---|---|---|
| **1** | **Isochrone-freeze for v3 QA anchors** (#96) | Trace to prioritize, then Coder | Proposed, not built. Closes #94/#127's longstanding Mapbox-drift residual (would make the anchors hard regression targets). |
| 2 | **National territory status map** (#121 OPEN / #122 ADOPTED) | future Coder session | Standalone nav item (not a Deal Territories expansion), rep-requested; not yet scoped. |
| 3 | **Territory-creation / authoring flow** | future Coder session | Deferred, needs its own scoping brief. Likely the first *new* service-role `territories` writer — the PR #104 triggers now protect it by construction. |
| 4 | **390px / authenticated deploy-preview QA tooling gap** | Trace / future Coder | No fix path identified; still limits browser QA on auth'd surfaces. |
| — | `qualification_reviews`/`rep_call_grades` FK cascade behavior | Trace decision | Open, not urgent. |
| — | Session E; Platform RBAC (raised 2026-07-08, no scoping doc) | Trace authorization | Unopened. |
| — | monday.com board ID discrepancy | Trace | Unreconciled since 2026-07-07. |
| — | Rick Dahlson copy review (#68/#71, `legal_flag`) | Trace / Rick | Still the real gate on any live prospect send. |
| — | Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Paused, unchanged. |
| — | Legacy public `/proposals/[prospectId]` retirement; `reserved_for` dead column; TopBar global search; repo-wide token-lint; PRD v1.2 embedded-signing staleness; prospect-page hydration (#418/#423/#425); Resend + Calendly provisioning; proposal revenue-model gap (§14 illustrative-only, #71/#76) | various | All unchanged from v2.36/v2.37 — carry forward, do not re-litigate. |

## Residual risks (stated plainly)

- **RLS-bypass write pattern — now CLOSED at the DB layer** by PR #104. The qa_locked
  UPDATE+DELETE triggers, the RLS UPDATE tightening, and the value-scoped `sold_boundary_geom`
  freeze remove the "next unguarded service-role write corrupts a governed row" class. Two
  documented residuals remain, both accepted: (a) the `sold_boundary_geom` escape hatch assumes
  `current_user='postgres'` is the sole admin/redraw role — a dependency on Supabase's role
  model (the app connects only as authenticated/service_role via PostgREST, never postgres);
  (b) sold/reserved rows have no DB-level DELETE guard (out of scope — only the boundary is
  frozen; qa_locked DELETE is covered).
- **v3 anchors — now superseded (#127), no longer stale.** Do not cite the old 15-minute
  figures (59,699 / 120,318 / 33,969) as current; use the §8.8 / #127 figures above. (If the
  `ops.decision_log` #117 row still reads OPEN, that is Chat's bookkeeping to close — the
  substance, supersession + doc, is done.)
- **v3 QA anchors still drift with Mapbox** (longstanding) — isochrone fetched live per job,
  never cached; isochrone-freeze (#96) not built. This is queue item 1.
- **Authenticated deploy-preview QA has no automated path** — limits browser QA on auth'd
  surfaces; carried forward.

## Not This Session (escalate, don't creep)

Isochrone-freeze (#96), the national status map, territory authoring, Session E, Platform RBAC,
and Box Sign all remain unopened — each requires explicit Trace authorization. The #123 trigger
build and the #94 supersession, both listed here in v2.37, are now **done** and removed from
this list.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable (deploy-preview QA reassigned to Coder — see `docs/AGENTS.md`) |
