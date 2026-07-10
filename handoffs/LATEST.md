# GHMD Sales Platform — Handoff v2.37

Date: 2026-07-10 | Prepared by: Coder at session close (docs/AGENTS.md session-close rule),
for Chat/Trace review | Purpose: capture the v3 floor clamp (#120), the #117 anchor re-run,
and the full Nashville data-integrity incident arc (#100/#101/#123/#102). Supersedes v2.36.

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

- Main HEAD `8518527` (PR #102 squash-merge). Open PRs: 0. Decision-log tip: **#123**.

## What shipped since v2.36

### 1. v3 minimum drive-time floor — PR #99, decision #120 (ADOPTED), merged `a8e928d`
`V3_MIN_DRIVE_MINUTES = 5` added to `/lib/addressable-market-constants.ts`; `sizeByExpansion`
clamps the **returned** boundary up to 5 minutes when the smallest qualifying minute m* < 5,
re-evaluating addressable at 5 (never the smaller technically-sufficient count). Additive clamp
— 45-min ceiling, `UNRESOLVED_*`, the 18,600 household floor, and the `[15,25,35,45]` probe set
all unchanged. Resolves TERRITORY-METHODOLOGY.md **§8.5** (now "Resolved Parameters"). Full
suite 971 at merge; `tsc`/lint clean. Review SOP tier `review` (dedicated pass, clean).

### 2. #117 anchor re-run — Part 2, decision #117 still OPEN
The three decision-#94-locked anchors were re-sized under the current (post-#102, #120) engine,
run through the **live** deployed `size-territory-background` worker (auth POST path isn't
headlessly drivable; Trace approved driving the real worker via a service-role-enqueued job).
New `territory_sizing_jobs` rows written; the six pre-#87 evidentiary rows preserved;
`territories.*` untouched.

| Anchor | New job id | Result |
|---|---|---|
| Austin – Westlake (`ab23f4d6…`) | `14fb63ba…` | VIABLE **13 min / 27,978.39** |
| Dallas – Preston Hollow (`806ac611…`) | `d6efac7b…` | VIABLE **9 min / 19,141.31** |
| Nashville – Green Hills (`5a89e1c9…`) | `7caf4c20…` | VIABLE **14 min / 21,420.60** |

**Notable:** the #120 clamp was **inert** — all three m* landed at 9–14 min, well above the
5-min floor, contrary to the "will clamp to 5" plausibility note in the brief. So #94 **is**
invalidated (boundaries now 9–14 min, not the locked 15), but by the refine-down algorithm
landing mid-range, not by pathologically small radii. The 15-min probe values are close to the
old locked figures (small Mapbox drift) — the invalidation is algorithmic, consistent with #117.

**OUTSTANDING (unblocked, not done):** the #94 supersession and the §8.8 doc update are **still
not written**. The job data exists and is verified; the `ops.decision_log` supersession entry
(Chat's write) and the §8.8 anchor-table update are the remaining step. §8.8 still reads
"established, decision #94."

### 3. Nashville data-integrity incident — full arc (closed)
- **Root cause:** the `territories/[id]` page render silently overwrote the Nashville
  `qa_locked=true` anchor via an RLS-bypassing admin client during this session
  (`addressable_patients_primary` 4,127 → 172,275, whole Davidson County), discovered by Chat
  cross-checking against an earlier same-session query. Not caused by the v3 sizing jobs
  (non-write boundary held) nor by any Coder `territories` write.
- **Restore:** two data-only corrections (Chat-directed SQL, not a PR) returned all incident-
  touched columns to their pre-incident/peer-consistent state; all three anchors now uniform.
- **PR #100** — `shouldRefreshV2Census` guard (pure predicate, gates the render census write on
  `!qa_locked` + cache-TTL + coords). Closes the render-write exposure. **No dedicated
  #-numbered decision** (verified: no `ops.decision_log` row keyed to PR #100).
- **PR #101** — `qa_locked` 409 guard on the approve route. Closes the second sibling, which was
  **live-primed** by item 2's three succeeded VIABLE jobs against locked, `status='available'`
  anchors (the status guard alone would not have blocked an exec approve).
- **Decision #123 (ADOPTED)** — authorized a scoping-only investigation of the root pattern.
- **PR #102** — `docs/RLS-BYPASS-WRITE-GUARD-SCOPING.md`: full inventory of every service-role/
  admin write, three options (A per-site / B shared helper / C DB trigger), **recommends C**
  (a `BEFORE UPDATE` trigger — the only mechanism that catches service-role + future write
  sites; RLS can't, because `territories.internal_users_all` is unconditional and encodes no
  `qa_locked` invariant), and six flags for Trace. Merged `8518527`. Build NOT authorized.

## Standing queue — reprioritized (Trace, this session)

**"Get everything tight and clean and secure before more building work."** The six flags from
decision #123 (§5 of the scoping doc) are now the **top of the queue** — settle the durable
governed-row protection before opening new build work.

| Priority | Item | Owner | Status |
|---|---|---|---|
| **1** | **Decision #123 six flags** (RLS posture, locked-row escape-hatch, sold/reserved parity, #102-gate compat, scope beyond territories, proposals posture) | Trace decides, then Coder builds chosen option | New top of queue. Scoping done (PR #102); build unauthorized. |
| **2** | **#94 supersession + §8.8 update** | Chat (decision-log) + doc | Unblocked by item 2 above, **not done**. Job data verified and ready. |
| 3 | **Isochrone-freeze for v3 QA anchors** (#96) | Trace to prioritize, then Coder | Unchanged — proposed, not built. Closes #94's longstanding Mapbox-drift residual. |
| 4 | **National territory status map** (#121 OPEN / #122 ADOPTED) | future Coder session | Confirmed a standalone nav item (not a Deal Territories expansion), rep-requested; not yet scoped. |
| 5 | **Territory-creation / authoring flow** | future Coder session | Deferred, needs its own scoping brief. |
| 6 | **390px / authenticated deploy-preview QA tooling gap** | Trace / future Coder | No fix path identified; still limits browser QA on auth'd surfaces. |
| — | `qualification_reviews`/`rep_call_grades` FK cascade behavior | Trace decision | Open, not urgent. |
| — | Session E; Platform RBAC (raised 2026-07-08, no scoping doc) | Trace authorization | Unopened. |
| — | monday.com board ID discrepancy | Trace | Unreconciled since 2026-07-07. |
| — | Rick Dahlson copy review (#68/#71, `legal_flag`) | Trace / Rick | Still the real gate on any live prospect send. |
| — | Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Paused, unchanged. |
| — | Legacy public `/proposals/[prospectId]` retirement; `reserved_for` dead column; TopBar global search; repo-wide token-lint; PRD v1.2 embedded-signing staleness; prospect-page hydration (#418/#423/#425); Resend + Calendly provisioning | various | All unchanged from v2.36 — carry forward, do not re-litigate. |

## Residual risks (stated plainly)

- **RLS-bypass write pattern** — root cause of the Nashville incident. Both known instances are
  fixed (PR #100/#101), but the durable fix (DB trigger, Option C) is scoped-only and unbuilt;
  a future service-role `territories` write with no guard would re-open the class. This is item 1.
- **v3 anchors invalidated (#117 OPEN)** — the re-run data exists but #94 is not yet superseded
  and §8.8 is stale; do not cite the old 15-min figures (59,699 / 120,318 / 33,969) as current.
- **v3 QA anchors still drift with Mapbox** (longstanding) — isochrone fetched live per job,
  never cached; isochrone-freeze (#96) not built.
- **Authenticated deploy-preview QA has no automated path** — limited verification of PR
  #100/#101 (guards proven by unit/source-scan tests, not browser); an exec-approve POST and a
  qa_locked render are not headlessly drivable.

## Not This Session (escalate, don't creep)

The #123 trigger build, the #94 supersession write, isochrone-freeze, the national status map,
territory authoring, Session E, Platform RBAC, and Box Sign all remain unopened — each requires
explicit Trace authorization (and, for #123, the six-flag decisions first).

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable (deploy-preview QA reassigned to Coder — see `docs/AGENTS.md`) |
