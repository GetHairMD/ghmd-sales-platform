# GHMD Sales Platform — Handoff v2.50

Date: 2026-07-14 | Prepared by: Coder (content briefed by Chat) | Purpose: close
out PR #133 (E-2 AC10 mobile-nav fix) and the E-2 QA pass that produced it —
AC8/AC9/AC10 are now **fully closed**, ending the carry-forward v2.49 opened.
Decisions #167 + #168. Supersedes v2.49.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open
> PRs, and security-advisor status are derived live at every session start (git,
> `ops.decision_log`, `get_advisors`). This handoff carries **narrative only** —
> what shipped and why, the judgment calls, the residual risks, and the queue.
> If you need HEAD or the decision-log tip, go get them live. Do not cite this
> file for them.

## What to do first (next session)

**E-3 (Resource Library — structure only, content unproduced) is next in the
confirmed sequence, but is NOT yet authorized to start.** It still awaits Trace's
explicit go-ahead. Per Sprint Discipline, **confirm the current module with Trace at
session start** — do not infer authorization from position in the queue. This is
unchanged from v2.49 and is restated deliberately, so the rule is not weakened by
omission.

## What shipped this cycle

### PR #133 — MERGED (`ffb9ff771b37696a31208b114c190ffa0d5893ad`) — E-2 AC10 mobile-nav fix

The E-2 deploy-preview walkthrough that v2.49 flagged as never performed was run, on
the **existing** deploy-preview path. It closed AC8 and AC9, and found AC10 genuinely
failing. PR #133 fixes AC10.

### AC8 / AC9 — closed, end-to-end, against real seats

Verified with clearly-labelled fixture posts, driven through the real UI as **QA Rep A**
and **QA-exec** (not adversarial JWT simulation):

- Rep submits → post lands `pending`, **invisible to the shared feed**, visible only in
  the rep's own "Your submissions". The rep is offered **no** Approve/Reject control at
  any point.
- Exec sees both submissions in Pending Review → approves one, rejects the other.
- The approved post reaches the **shared feed for both seats**; the rejected one does
  not, and its author can still see its outcome.
- The database confirms the UI rather than merely agreeing with it: `reviewed_by` /
  `reviewed_at` are stamped with **reviewer ≠ author**. A rep cannot self-stamp its own
  review audit.

Fixtures were deleted afterward. `community_board_posts` is back to **0 rows**,
independently re-verified (by Chat after cleanup, and again by Coder post-#133-merge).

### AC10 — found failing, fixed

**This is a different bug from the PR #130 label-crushing one, which stayed fixed.** The
bar correctly scrolls rather than crushing labels (`overflow-x-auto` working as designed).
But it opened at **`scrollLeft = 0` unconditionally**, so the active tab sat **off-screen**
on `/community-board` and `/scoreboard`: a rep on a phone got **no active-state feedback at
all** on the two newest destinations, which were reachable only by discovering a sideways
scroll on the bar.

**A document-level `scrollWidth` check does not catch this** — it reports no overflow
(390 == 390), because the overflow is contained *inside* the nav by design. It was caught
by measuring the nav element itself and by looking at the render. That is the second time
in two PRs this bar has produced a defect that a `scrollWidth` assertion certified as fine.
**Standing lesson, now twice-earned: for mobile nav, assertions are not a substitute for
eyes on the render.**

The fix:

- **`activeTabScrollLeft()`** (`nav-items.ts`) — a **pure, unit-tested geometry function**:
  centers the active tab, then clamps into `[0, maxScroll]`. Pure on purpose — this repo has
  no DOM test infra and jsdom has no layout engine (every box metric reads 0), so taking
  measured geometry as *input* is what makes the logic testable at all.
- **`BottomTabBar`** writes `nav.scrollLeft` directly via `useLayoutEffect`, keyed on
  `pathname`. Deliberately **NOT `scrollIntoView()`**, which scrolls every scrollable
  ancestor and is therefore free to pan the **page body** horizontally — the exact invariant
  this bar's contained overflow exists to protect.

Verified **live on the PR's own deploy preview**, not just by assertion: `scrollLeft = 186`
on both previously-failing routes — exactly `maxScroll` (576 − 390), matching the unit test's
predicted clamp — with the active tab fully visible and highlighted; `/dashboard` correctly
stays at `scrollLeft = 0` (no gratuitous scroll when the tab is already in view); and
page-level horizontal overflow confirmed `false` on every route checked.

### A retracted claim — the "duplicate `aria-label`" was never a defect

The original QA report flagged a secondary a11y issue: `Sidebar` and `BottomTabBar` both
used `aria-label="Primary"`. **This was checked before shipping and retracted, not fixed.**
The two navs are mutually exclusive by breakpoint (`hidden md:flex` vs `md:hidden`), and
`display: none` removes a node from the accessibility tree — so **no screen reader was ever
offered two same-named landmarks.** It was not a live defect.

The rename to `aria-label="Primary mobile"` shipped anyway as a **defensive-only** measure
(it forecloses the collision if either bar is ever shown at both breakpoints someday), and
is labelled as exactly that in both the code comment and the PR body. It is **not** presented
as a bug fix. Recorded here because the correction is the point: the claim was walked back
before it could harden into folklore.

## Second-Opinion Gate — auto-pass, verified correct

PR #133 carried **no `second-opinion-gate` classification block and auto-passed.** This was
**verified against `docs/SECOND-OPINION-GATE.md`, not assumed**: the five trigger categories
are (1) security/auth boundaries, RLS policies, webhook signature verification; (2) financial
formulas; (3) PHI-adjacent data paths; (4) operator-score gating logic; (5) NPI provider data
handling. **Mobile nav UI is none of them** — it is excluded by design.

**The auto-pass is a complete and final outcome for this PR, not a placeholder and not a
gap.** Stated explicitly so that a future reader does not mistake the absent classification
block for an oversight.

## Production-QA guard — authorized, never built, now lapsed

Earlier in this cycle Trace authorized a **fallback** path, in case the PR #130 deploy-preview
host had stopped resolving post-merge: a **separate, explicitly-named `prepareProductionQALogin()`**
function — deliberately **not** a widened hostname regex on the existing `preparePreviewLogin()`
guard, since widening the shared guard would leave every future preview-QA call one string away
from silently targeting production.

**It was never needed and never written.** The preview host was confirmed live by a
*differential* probe (`/community-board` and `/scoreboard` returning 200 while a nonsense route
404'd — ruling out a stale-deploy or catch-all false positive), so `preparePreviewLogin()` was
used **untouched**. There is **no diff, no new function, and no guard-override event.**

**That authorization is not standing.** It lapsed when this QA pass concluded on the
preview path. A future session needing production QA must **obtain it again from Trace** —
do not treat this paragraph as a live grant.

## Process note — the delete that errored, and was not assumed

During fixture cleanup, the first delete attempt **errored**: it had been bundled with a count
query against a `bell_ringing` table that does not exist (the bell trigger inserts into
`community_board_posts` itself), and the error aborted the whole batch — so **nothing was
deleted**. Coder did **not** assume the delete had succeeded despite the error; it re-ran and
confirmed `posts_remaining: 0, fixtures_remaining: 0` before reporting done.

Worth naming explicitly: an error that aborts a batch is exactly the situation in which a
"probably fine" would have left real fixture rows sitting on the production Community Board.
This is the "don't assume — verify" discipline the project has been building toward since the
#101 → #105 correction (*merged migration ≠ applied migration*), and it is the same instinct
that caught AC10 in the first place.

## Decisions logged this cycle

| # | Substance | `related_pr` |
|---|---|---|
| #167 | AC8/9/10 closure + the AC10 production-QA authorization | **NULL** — covers the QA pass itself, which had no accompanying PR |
| #168 | PR #133 merge, and the correction to #167's "a11y nit" mischaracterization | 133 |

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| E-2 (Community Board) | — | **SHIPPED + QA-CLOSED** (PR #130, `0d66b9b`; AC10 fix PR #133, `ffb9ff7`; decisions #161/#162/#165/#166/#167/#168) |
| ~~AC8 / AC9 / AC10~~ | — | **CLOSED this cycle.** AC8/AC9 verified end-to-end against real rep + exec seats; AC10 found failing and fixed in PR #133. No longer carried forward. |
| QA/deploy-preview credential isolation (#165) | Trace, then Coder | **Accepted residual risk, on the backlog.** Separate preview Supabase project, or a QA designation with zero production RLS grants. No urgency trigger yet — **revisit before Community Board carries real customer/deal-identifying content at scale** |
| `preview-login.ts` decision citation | future Coder, opportunistic | Docstring cites **#146**, which is the wrong decision. Correct it to **#165** whenever the file is next touched — not worth its own PR. (Still outstanding: #133 did not touch this file.) |
| Session E remaining modules (E-3 Resource Library — structure only, content unproduced — E-4 Template Gallery, E-5 Events & Invites, E-6 Objection playbook) | Trace authorization per #159 | **E-3 next in the confirmed sequence, NOT yet authorized.** Confirm with Trace at session start per Sprint Discipline |
| E-5 blocked on a Trace call | Trace | Webinar registration source (Calendly vs. Zoom webhook) still undecided — flagged in #159, not needed until E-5 |
| Rep provisioning | Trace | **Two real rep seats now exist** (QA Rep A/B, #161) — this is a *fixture*, not a sales-team rollout. Real reps are still unprovisioned |
| AC5 forward-going state population (E-0b) | future QA | Still code/build-verified only, not runtime-exercised |
| Dashboard service-role RLS bypass (`src/lib/dashboard/data.ts`) | future Coder | Unchanged |
| No rep INSERT/UPDATE policy on `prospects` | future Coder | Unchanged. **Remember `prospects` is on column-level UPDATE grants** (E-1's `funded_won_at` lockdown): any new rep-write policy needs its columns explicitly granted, and must **not** include `funded_won_at` |
| No DB-level check `assigned_rep_id` → `designation='rep'` | future Coder, low priority | Unchanged |
| TopBar global search — nullable-status exposure | future Coder | Unchanged |
| Legacy ArcGIS sold-territory import (#141) | Trace | Unchanged, deferred |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, #136/#137) | Still live by explicit ongoing decision |
| Demo/test data cleanup | future Coder | Unchanged |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Unchanged, paused externally |

## Carried forward from v2.49 — still true, do not "fix" these

- **Retired QA Rep A UUID (`de190bae-…`) still appears in two files on purpose**: the
  already-applied migration `20260714170000_e2_qa_rep_provisioning.sql`, and the corresponding
  assertion in `e2-community-board.test.ts`. Applied migrations are immutable history. A Rule
  0-E-style grep **will keep hitting these two — that is expected, not contamination.** The live
  database holds **zero** references to it. Current QA Rep A UUID is
  `6ef1bb8b-e133-4861-b176-bed75b5f206a`; QA Rep B was unaffected.
- **NIP remains fully off-limits** (`kjweckggegifjmmqccul` / `ghmdnetwork.netlify.app`) — see
  CLAUDE.md "NIP Separation" and the Hard Boundaries table in `docs/AGENTS.md`. Decision **#163**
  authorized one *separately-scoped* cross-project NIP session; it does **not** relax the standing
  boundary, and it is the likely origin of the wrong-repo Coder session that Rules 0 / 0-C caught
  and stopped with zero writes last cycle.

## Note on `AUTH_GATE_DISABLED`

Unchanged: deliberate, ongoing decision (#136/#137), not a lapsed oversight. Still live in
production. Continue noting it every go-live-readiness session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
