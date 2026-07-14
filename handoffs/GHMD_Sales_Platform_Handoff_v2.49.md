# GHMD Sales Platform — Handoff v2.49

Date: 2026-07-14 | Prepared by: Coder (content briefed by Chat) | Purpose: close
out PR #130 (E-2 Community Board), including six fixed Second-Opinion Gate BLOCKs,
one architectural finding accepted by Trace as residual risk (decision #165), and a
post-merge QA credential rotation (decision #166). Supersedes v2.48.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open
> PRs, and security-advisor status are derived live at every session start (git,
> `ops.decision_log`, `get_advisors`). This handoff carries **narrative only** —
> what shipped and why, the judgment calls, the residual risks, and the queue.
> v2.48 carried an "as-of-session" state table; v2.49 deliberately drops it. If you
> need HEAD or the decision-log tip, go get them live. Do not cite this file for them.

## What shipped this cycle

### PR #130 — MERGED (`0d66b9bc8679d5161f7bdd86027d282d196afc8c`) — E-2 Community Board (ultrareview, decisions #161 + #162)

Session E, module 2 of 6. Rep post submission + executive review queue, built on the
`community_board_posts` table E-1 shipped deliberately write-path-less.

- **#162 — authorship / review model.** Reps author posts that land `pending`;
  executives review and publish. Audit columns (`reviewed_by`/`reviewed_at`) are
  stamped by a trigger, never accepted from a client.
- **#161 — QA Rep A/B fixture provisioning.** The first *real* rep seats in the
  platform's history. Every rep-siloed policy shipped before this (E-0a, E-0b, E-1)
  had only ever been provable by adversarial JWT simulation, because no `rep`-designated
  account existed to sign in as. E-2's rep-vs-rep isolation ACs are the first that were
  proven with two genuinely distinct authenticated rep sessions.

Two defects were found and fixed inside the PR itself, both worth remembering:

1. **The login form had no `method`**, so a submit landing before hydration fell back
   to a native **GET** and put the password in the URL query string. Fixed
   (`method="post"`) with a regression test. This bug is what caused the credential
   incident below — the QA Rep A password was exposed in a session transcript while
   the bug was being reproduced.
2. **`BOTTOM_TABS` is derived from `NAV_ITEMS`**, so any new nav item silently joins
   the mobile tab bar. The 8th tab crushed the labels at 390px — and a `scrollWidth`
   assertion reported *no* overflow (flex shrank the labels instead of overflowing),
   so it was caught only by **looking at the screenshot**. Standing lesson for mobile
   QA: assertions are not a substitute for eyes on the render.

### Second-Opinion Gate — six BLOCKs closed, one accepted as residual risk

Six genuine BLOCKs, all on the Community Board's own RLS/trigger logic. Each was
**reproduced live before being fixed** and re-proven closed afterward against the real
QA Rep A / QA Rep B / QA-exec seats. Each fix is its own migration — no already-applied
migration was edited.

1. **`select_own` didn't gate on live `internal_users` membership** — an offboarded
   account could keep reading its own drafts forever. Now requires a live allow-list row.
2. **Audit columns forgeable on INSERT** — the stamp trigger was UPDATE-only. Now
   `BEFORE INSERT OR UPDATE`; both columns forced NULL on insert.
3. **An executive could INSERT a fabricated `bell_ringing` post** directly via PostgREST,
   manufacturing evidence of a funded close that never happened. Exec INSERT policy now
   excludes `bell_ringing`.
4. **An executive could UPDATE `post_type`/`rep_id` on any row** — the same fabrication,
   reached through UPDATE instead of INSERT. Trigger now pins both.
5. **An executive could still rewrite a genuine bell's `title`/`body`/`territory_id`/
   `created_at`** — repurposing one real bell into a claim about a different or invented
   close. Fixed **deny-by-default** (`new := old` on bells), *not* by enumerating the
   columns to protect. This distinction is the durable lesson: enumerating protected
   columns is a list that silently goes stale the next time a column is added;
   deny-by-default fails closed on columns that don't exist yet.
6. **`pinned` was client-settable on INSERT** — a rep could self-pin, and an approval
   that changed only `status` would then publish that self-pinned post to the top of the
   feed, with nothing in the reviewer's UI indicating it. Fixed `pinned := false` on
   INSERT, **every role, no exception**.

### The seventh finding — architectural, accepted by Trace (decision #165)

The 7th BLOCK was categorically different: not about the board's logic at all, but about
the **QA credential architecture**. `getQaSeatCredentials()` / `getQaExecCredentials()`
were **exported** (the latter since PR #121, predating E-2 entirely), so an in-repo importer
could obtain real production QA credentials **without ever running the hostname guard** that
is supposed to confine them to deploy previews.

The narrow claim was fixed: both accessors are now module-private. That change is
decision-relevant in its own right — it makes `preview-login.ts`'s own header invariant
true **for the first time**.

The underlying exposure is not fixable in this PR and was not pretended to be. Three QA
seats (QA-exec, QA Rep A, QA Rep B) are **real production-allow-listed principals**. One
Supabase project backs both production and every deploy preview, so there is **no
database-level preview/production isolation** — the seats are confined only by a
*script-level* hostname guard. Anyone holding the raw environment variables can bypass the
guard and authenticate straight to production PostgREST.

**Trace reviewed this and explicitly overrode it**, accepting it as a known property of the
current QA/deploy-preview design rather than funding real isolation right now. Logged as
**decision #165**. Real isolation — a separate preview Supabase project, or a QA designation
carrying zero production RLS grants — is **on the backlog, not abandoned**. Revisit it
if/when real prospect or customer data starts flowing through Community Board; the risk is
tolerable today largely because the board carries little of consequence yet.

**Correction to carry forward:** decision **#146** is cited in the PR body *and in the
shipped `preview-login.ts` docstring* as the prior acceptance of this risk. That citation is
**wrong** — #146 is the Territory Scouting scope decision, which only tangentially notes that
the QA-exec account existed at the time. **There was no prior formal decision-log entry
adopting this specific risk before #165.** Not worth a dedicated PR to correct a comment, but
**if `preview-login.ts` is touched again, change the citation from #146 to #165.**

## Post-merge incident — QA Rep A credential rotation (decision #166)

QA Rep A's password leaked into a Coder session transcript during the login-form bug
reproduction described above. Trace **deleted and recreated** the fixture account rather than
attempting an in-session rotation — the right call, since an in-session rotation would have
routed a new password through the same transcript.

- New auth UUID: **`6ef1bb8b-e133-4861-b176-bed75b5f206a`**.
- Old UUID `de190bae-…` is **retired and cascade-deleted**; zero orphaned references were
  confirmed across every `NO ACTION`-constrained FK **before** deletion.
- The `internal_users` row was reinserted as a **data-only fixture** (a one-off insert, *not*
  a migration — a QA seat's UUID is environment-specific state and does not belong in
  replayable schema history) and independently verified by Chat.
- **QA Rep B was unaffected** and remains valid.

**Note for future sessions — do not "fix" these.** Two **inert historical references** to the
retired UUID remain in the repo *on purpose*: the already-applied migration
`20260714170000_e2_qa_rep_provisioning.sql`, and the corresponding assertion in
`e2-community-board.test.ts`. Applied migrations are immutable history; editing one to match
later state would make the repo disagree with what actually ran. A Rule 0-E-style grep for the
old UUID **will keep hitting these two files — that is expected, not contamination.** The live
database holds **zero** references to it (verified against `pg_policies` and `pg_proc`): rep
siloing gates on `designation = 'rep'` generically, never on a specific UUID.

## Process note — a wrong-repo Coder session

Mid-cycle, a Coder session that had been opened against **`gethairmd-network` (the NIP)**
instead of `ghmd-sales-platform` was handed the `internal_users`-insert brief. **Rules 0 and
0-C caught it exactly as designed**: the session confirmed the remote, found that none of the
referenced entities (the table, the UUIDs, the decision numbers, the PR) existed in NIP's
schema, and **stopped without writing anything**. No damage. The likely cause is a leftover tab
from the separately-authorized cross-project NIP session run the same day (decision #163).
Re-run in a correctly-scoped session, the task completed cleanly.

**No process change needed — the standing rule did its job.** Recording it because a
near-miss that a control *caught* is evidence the control is worth keeping, and that is worth
knowing the next time someone proposes trimming the session-start checks as boilerplate.

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| E-2 (Community Board) | — | **SHIPPED** (PR #130, `0d66b9b`; decisions #161 + #162, six gate BLOCKs fixed, one accepted as #165) |
| **AC8 / AC9 / AC10 (feed, review queue, 390px browser QA)** | **next Coder / QA** | **CARRY FORWARD — NOT confirmed complete.** The PR body listed these as pending on the deploy preview with "will report before merge"; **no such report was ever posted**, and the PR merged without one. Treat the three-seat deploy-preview walkthrough as **outstanding**, not done. |
| QA/deploy-preview credential isolation (#165) | Trace, then Coder | **Accepted residual risk, on the backlog.** Separate preview Supabase project, or a QA designation with zero production RLS grants. No urgency trigger yet — **revisit before Community Board carries real customer/deal-identifying content at scale** |
| `preview-login.ts` decision citation | future Coder, opportunistic | Docstring cites **#146**, which is the wrong decision. Correct it to **#165** whenever the file is next touched — not worth its own PR |
| Session E remaining modules (E-3 Resource Library — structure only, content unproduced — E-4 Template Gallery, E-5 Events & Invites, E-6 Objection playbook) | Trace authorization per #159 | **E-3 next in the confirmed sequence.** Confirm current sprint / next module with Trace at session start per Sprint Discipline |
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

## Note on `AUTH_GATE_DISABLED`

Unchanged: deliberate, ongoing decision (#136/#137), not a lapsed oversight. Still live in
production. Continue noting it every go-live-readiness session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
