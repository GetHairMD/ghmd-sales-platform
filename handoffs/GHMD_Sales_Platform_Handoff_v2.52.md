# GHMD Sales Platform — Handoff v2.52

Date: 2026-07-16 | Prepared by: Coder (content briefed by Chat) | Purpose: close out
the PR #139 arc — the §4D Rep Command Center (nine Second-Opinion Gate rounds, two
accepted design/policy residuals, one merge-closure entry). Decisions #172 + #173 +
#174. Supersedes v2.51.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open
> PRs, and security-advisor status are derived live at every session start (git,
> `ops.decision_log`, `get_advisors`). This handoff carries **narrative only** —
> what shipped and why, the judgment calls, the residual risks, and the queue.
> If you need HEAD or the decision-log tip, go get them live. Do not cite this
> file for them.

## What to do first (next session)

**One thread now stands alone as "what's next" — the other resolved this cycle.**

1. **Session E's next module.** Unchanged from v2.51: E-3 was module 3 of 4 (decision
   #159). Per `docs/SALES-OS-SPEC.md` §4C the next module *would be* **E-4, the Email
   & SMS Template Gallery** (§4C item 5). Naming it here is orientation only — **Sprint
   Discipline still requires confirming the current module with Trace at session start.
   Do not infer authorization from position in the queue.**
2. **Rep Command Center — RESOLVED this cycle.** Was v2.51's second competing thread
   ("drafted, confirmed, not dispatched"). It has now shipped (PR #139, merged
   `28f69a0`). Remove from any future "what's next" framing — it is a shipped feature,
   not a queued one. Its own follow-up (multi-deal UX) is a *separate*, still-unscoped
   item — see Standing Queue below.

## What shipped this cycle

### PR #139 — MERGED (`28f69a0`) — §4D Rep Command Center: discount governance + concealed exec-only routing [ultrareview, 9 gate rounds]

Executive-only management view of per-rep performance and discount-aware revenue
(gross vs. net, discount frequency by reason, deal-cycle time, two closing-rate
variants, per-deal drill-down), concealed more strictly than the existing `execOnly`
pattern: to any non-executive the route is indistinguishable from a URL that was
never built (genuine-404 body match, zero nav leak at the bundle level, zero backing
API routes by construction).

**Nine Second-Opinion Gate rounds, each a genuine, independently-verified finding —
not relayed from Coder self-report at any point:**

| Round | Defect closed |
|---|---|
| 1 | Original PR — discount-column data model, concealment routing, column lockdown |
| 2 | `netRevenue` silently counted missing/NULL `territory_price` as a confirmed $179k close (fabrication) |
| 3 | Missing-price state was UI-mitigated, not DB-enforced — Trace's resolution: DB-enforced invariant (`stamp_prospect_funded_won()` rejects the crossing without a priced deal), 21 legacy prospects backfilled, real exec discount-entry action shipped |
| 4 | `netRevenue` used latest-deal-only, silently dropping revenue for repeat multi-territory customers — split `distinctCustomersClosed` vs `totalDealsClosed`; multi-deal UX (history panel, add-another, picker) deliberately deferred to a follow-up PR |
| 5 | `territory_price` had an unguarded `authenticated` UPDATE grant — a rep could deepen an existing discount with zero new authorization |
| 6 | Concurrent-close double-deal race — two near-simultaneous closes of the same prospect could both insert a $179k deal |
| 7 | Cross-function race Round 6 missed — `setTerritoryPrice` and `ensure_priced_deal` had no shared lock |
| 8 | Raw `authenticated` INSERT grant on `deals` — a rep could fabricate arbitrary deal rows directly, no race required (most severe finding of the arc) |
| 9 | `authenticated` also held table-level DELETE/TRUNCATE on `deals` — a rep could delete any deal row; TRUNCATE bypasses RLS entirely. Revoked. Also corrected the PR-body classification block (`coder_residual_risk: none → accepted`) to match decision #172 |

Every round's fix was independently verified live by Chat — adversarial role-simulated
DB probes (not relayed), grant diffs cited before/after, advisor diffs re-run, fixture
cleanup confirmed by row count. Round 8 and Round 9 both surfaced fully-deterministic
exploits (no timing/race required) that Chat reproduced live before the brief and again
after the fix.

**Two accepted design/policy residuals, both Trace's explicit call, both standing:**

- **Decision #172** — the discount-authorization trigger validates `discount_authorized_by`
  only on INSERT or when that UUID changes; an UPDATE retaining the same (now possibly
  revoked) authorizer is not re-validated. Trace's call: historical authorizer validity
  stands as-recorded — history is not retroactively invalidated when an authorizer is
  later removed from the registry. This resurfaced independently across at least four
  separate gate runs through the arc; #172 is the single authoritative resolution. If a
  future gate run raises it again, that is the second-opinion model re-deriving a true
  but already-decided fact, not a new finding — point to #172, do not re-litigate.
- **Decision #173** — the concealment 404-rewrite (needed to byte-match the real static
  404 body) leaves a generic `x-middleware-rewrite: /__not-found__` response header
  visible only via direct network-traffic inspection on that one path. Model A (shipped)
  accepted over Model B (relocate the real route to an undisclosed internal address,
  which only relocates the same residual rather than eliminating it).

**Decision #174** — merge-closure entry, `related_pr: NULL` (the one-bound-row-per-PR
slot is held by #172), referencing PR #139 in text only — same pattern as #171 for
PR #136.

## Second-Opinion Gate — 9 rounds, all resolved

PR #139 carried a `second-opinion-gate` classification block (category 1 — new auth
boundary) throughout. Eight rounds were genuine code defects, fixed. One round (the
declaration-integrity check, twice) was a documentation-consistency defect in the PR
body itself, not a code finding — corrected in Round 9 alongside the DELETE/TRUNCATE
fix. The final gate run after Round 9 still showed `failure`, but only because the
second-opinion model re-derived the #172 question fresh (no persistent memory across
runs) — Trace merged via admin override on that basis, per standing merge authority.

## Decisions logged this cycle

| # | Substance | `related_pr` |
|---|---|---|
| #172 | §4D discount-authorization trigger — historical authorizer validity accepted as-recorded (Second-Opinion Gate override, Trace's call) | 139 |
| #173 | Rep Command Center concealment — `x-middleware-rewrite` header residual accepted as Model A, Model B explicitly rejected | **NULL** |
| #174 | PR #139 merge closure (`28f69a0`) — gate fully resolved across 9 rounds; residual risks accepted per #172/#173 | **NULL** |

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

Unchanged items below are carried forward from v2.51 **as-is, not re-verified this
cycle** — this session's work was scoped to PR #139 only.

| Item | Owner | Status |
|---|---|---|
| E-2 (Community Board) | — | SHIPPED + QA-CLOSED (unchanged from v2.51) |
| E-3 (Resource Library, structure only) | — | SHIPPED (unchanged from v2.51) |
| Deploy-preview QA for PR #136 | Trace, then Coder | Never performed — carry forward unchanged (see v2.51 for full AC breakdown) |
| **Rep Command Center (§4D)** | — | **SHIPPED this cycle** (PR #139, `28f69a0`). Was previously "drafted, not dispatched" — now complete. Remove from future "what's next" framing. |
| **Multi-deal UX follow-up** (deal-history panel, add-another-territory, from-scratch territory picker) | Trace to scope | **Deliberately deferred since Round 4 of PR #139. Still not scoped or started.** The correctness fixes (revenue no longer silently dropped for multi-deal customers) shipped in #139; the UX to *act* on multiple deals per customer did not. |
| Session E next module | Trace authorization per #159 | Next *would be* **E-4 (Email & SMS Template Gallery, §4C.5)** — **not confirmed, confirm with Trace at session start** |
| E-5 blocked on a Trace call | Trace | Webinar registration source (Calendly vs. Zoom webhook) still undecided |
| Dashboard service-role RLS bypass (`src/lib/dashboard/data.ts`) | future Coder | Unchanged |
| QA/deploy-preview credential isolation (#165) | Trace, then Coder | Accepted residual risk, on the backlog |
| `preview-login.ts` decision citation | future Coder, opportunistic | Docstring still cites #146; correct origin is #165. Fix opportunistically only |
| Rep provisioning | Trace | Two QA rep seats exist as fixtures; real reps still unprovisioned |
| AC5 forward-going state population (E-0b) | future QA | Still code/build-verified only |
| No rep INSERT/UPDATE policy on `prospects` | future Coder | Unchanged. `prospects` is on column-level UPDATE grants — any new rep-write policy needs columns explicitly granted, must not include `funded_won_at` |
| No DB-level check `assigned_rep_id` → `designation='rep'` | future Coder, low priority | Unchanged |
| TopBar global search — nullable-status exposure | future Coder | Unchanged |
| Legacy ArcGIS sold-territory import (#141) | Trace | Unchanged, deferred |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, #136/#137) | Still live by explicit ongoing decision |
| Demo/test data cleanup | future Coder | Unchanged |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Unchanged, paused externally |

## Carried forward — still true, do not "fix" these

- **Retired QA Rep A UUID (`de190bae-…`)** still appears in two files on purpose (an
  applied migration + a test assertion). Live database holds zero references. Current
  QA Rep A UUID is `6ef1bb8b-e133-4861-b176-bed75b5f206a` — this is the identity used
  in every PR #139 adversarial probe this cycle.
- **NIP remains fully off-limits** (`kjweckggegifjmmqccul` / `ghmdnetwork.netlify.app`).

## Note on `AUTH_GATE_DISABLED`

Unchanged: deliberate, ongoing decision (#136/#137), not a lapsed oversight. Still live
in production. Continue noting it every go-live-readiness session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
