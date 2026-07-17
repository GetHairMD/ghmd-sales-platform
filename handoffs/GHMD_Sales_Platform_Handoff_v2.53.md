# GHMD Sales Platform — Handoff v2.53

Date: 2026-07-17 | Prepared by: Coder (content briefed by Chat) | Purpose: close out
the Multi-Deal Pipeline Architecture arc — deals.stage un-deprecated and made
authoritative, prospects.stage/deal_status derived, governed write paths, and the
three brief-mandated UI deliverables. Decision #175. Supersedes v2.52.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open
> PRs, and security-advisor status are derived live at every session start (git,
> `ops.decision_log`, `get_advisors`). This handoff carries **narrative only** —
> what shipped and why, the judgment calls, the residual risks, and the queue.
> If you need HEAD or the decision-log tip, go get them live. Do not cite this
> file for them.

## What to do first (next session)

**The multi-deal thread that dominated the last two cycles is now fully resolved.**
It shipped, deployed, and is logged — remove it from any "what's next" framing.

1. **Session E's next module.** Unchanged from v2.51/v2.52: E-3 was module 3 of 4
   (decision #159). Per `docs/SALES-OS-SPEC.md` §4C the next module *would be*
   **E-4, the Email & SMS Template Gallery** (§4C item 5). Naming it here is
   orientation only — **Sprint Discipline still requires confirming the current
   module with Trace at session start. Do not infer authorization from position
   in the queue.**
2. **Multi-deal architecture — RESOLVED this cycle.** Was v2.52's standing-queue
   item ("deliberately deferred since Round 4 of PR #139... still not scoped or
   started"). It has now shipped in full: PR #142 (schema + governed write paths,
   `dcfa932`) and PR #143 (UI: deal-history panel, territory picker,
   add-another-territory, dashboard feed, `c2f4f99`), both merged, both
   independently confirmed live in production. Decision #175 logged. Nothing
   further required to close this thread — see Standing Queue for the residuals
   it left behind, which are accepted, not open work.

## What shipped this cycle

### PR #142 — MERGED (`dcfa932`) — Multi-Deal Pipeline Architecture PR-A: deals.stage authoritative, prospects.stage derived, governed deal writes [ultrareview]

Un-deprecated `deals.stage` (dead since decision #53/#58, 2026-07-03/04) and made
it the authoritative per-territory pipeline position. `prospects.stage` and the
new `deals.deal_status` become trigger-derived customer-level roll-ups (MAX over
non-lost deals). This is a **partial revision of decision #53 item (A)** —
same pattern #110 applied to #53's `skipped_triage` portion — because #53's
single-deal-per-customer assumption stopped holding once GHMD's real
multi-territory repeat customers were discovered (PR #139 Round 4, deferred
there). This PR resolves that deferral.

**What changed (migration `20260716260000_multi_deal_pipeline.sql`, 850 lines,
plus a same-day follow-up `20260716270000_create_territory_deal_dedupe.sql`):**
- `deals.stage` un-deprecated, `1..12` domain CHECK; new `deals.deal_status`
  (`active|stalled|lost`) and `deals.funded_won_at` (per-deal close stamp).
- Lossless backfill from the parent prospect — 28/28 rows verified matching,
  zero false close stamps. Section order was load-bearing: the backfill ran
  *before* the close trigger existed, or all 23 legacy Funded/Won prospects
  would have been false-stamped with today's date.
- `recompute_prospect_pipeline()` — AFTER trigger on `deals` deriving the
  customer-level roll-up (MAX stage over non-lost deals; deal_status by
  active > stalled > lost precedence). GUC handshake (`ghmd.stage_recompute`)
  admits exactly this one legitimate writer.
- `prospects_stage_derivation_guard` — BEFORE trigger rejecting any direct
  `prospects.stage` write while a non-lost deal exists (raw PostgREST, a legacy
  code path, a future regression — all rejected, not just discouraged).
- `ensure_priced_deal`/`set_deal_price` updated: a first-deal insert now
  **inherits** the prospect's current stage/status rather than defaulting to
  stage 1 — a default insert would otherwise drag an in-flight close backward
  through the derivation.
- `create_territory_deal(prospect, territory)` — the **only** client
  deal-creation path (the PR #139 Round-8 INSERT revoke stands). Assigned-rep-
  or-exec (designation re-derived independently every call, never trusted from
  a client claim); territory must be `available` (sold hard-blocked, draft/NULL
  fail closed); $179k list, discount fields NULL; first deal inherits,
  subsequent deals start fresh at stage 1. Same-day follow-up added a duplicate-
  deal guard (a prospect can't hold two non-lost deals on the same territory,
  but a lost deal doesn't block a genuine re-approach).
- `move_deal_stage(deal, target)` — exec-only; the qualification hard gate
  (decision #110) is now **DB-enforced** on this path, not just app-layer.
- `stamp_deal_funded_won()` — per-deal close trigger; marks the deal's own
  territory (`deals.territory_id`, the authoritative link) sold.
- `set_customer_deal_status`/`set_deal_status` — governed status writes,
  exec-only.
- **`authenticated` UPDATE on `deals` fully revoked**, column and table level —
  closed a dormant surface (inert while `stage` was deprecated) that the
  derivation trigger would otherwise have weaponized: any internal user could
  have closed any deal with one raw PostgREST call.
- `moveProspectStage` rewired to move the prospect's *leading* non-lost deal
  (`resolveLeadingDeal`, `src/lib/leading-deal.ts`); `DealStatusSelector` routed
  through `set_customer_deal_status`.

**Adversarial verification:** 18 live-DB probes (QA-exec, QA Rep A, QA Rep B,
anon) — role bypass attempts, sold/draft territory rejection, raw grant-bypass
attempts, the qualification gate, first-deal-inherit correctness, and a full
close-chain/bell-count check — all reproduced-and-blocked or reproduced-and-
correct. 1480/1480 tests pass.

**Independently verified by Chat, not relayed:** live grants confirmed via
`information_schema` (zero `authenticated` write privileges on `deals` at either
grain); every new/changed function body read directly and confirmed to match
claimed identity re-derivation, row-locking, and gate logic; backfill confirmed
exact (0 mismatches, 28/28); fixture cleanup confirmed exact; `get_advisors`
showed only the 4 expected new WARN-level findings (the client RPCs, same
accepted identity-gated pattern as pre-existing functions), nothing at ERROR
level. The funded-won trigger cascade (deal close → per-deal stamp → derivation
→ potential re-fire of the *original* PR #139 prospect-level stamp) was traced
independently and confirmed benign — that original trigger is guarded by
`funded_won_at IS NULL` and can fire at most once per prospect, so no double-
territory-marking risk exists despite two close-marking mechanisms now coexisting.

**Self-flagged, real, promptly closed:** because the migration was applied to
the live DB ahead of the code merge (standing apply-then-merge pattern), there
was a genuine window — confirmed live via `pg_trigger`, not assumed — where any
stage move on a dealt prospect failed closed (`23514`) against the old, not-yet-
replaced `moveProspectStage`. Coder flagged this in a PR comment before Chat
even asked. Closed the moment #142 merged and deployed (confirmed via Netlify:
deploy `6a59bdf1...`, `commit_ref: dcfa932`, published 2026-07-17T05:31:16Z,
secret scan clean across 3,023 files).

### PR #143 — MERGED (`c2f4f99`) — Multi-Deal Pipeline Architecture PR-B: deal-history panel, territory picker, add-another-territory, dashboard feed [ultrareview]

The UI half, deliberately split from PR-A (zero file overlap, confirmed) so the
grant/trigger surface got a smaller, purely-security gate diff.

- **Deal-history panel** (`DealHistoryPanel`, `/prospects/[id]`, every viewer):
  every deal with territory name, stage, price, per-deal close date,
  active/closed/stalled/lost distinction. Discount facts render for executives
  only (service-client read inside the exec branch, same pattern as
  `TerritoryPriceControl`). Per-deal stage/status controls call the DB-gated
  RPCs directly.
- **Territory picker** (`TerritoryPickerDialog`): `available`-only; a territory
  already carrying an active deal from a *different* prospect gets a visible,
  **non-blocking** "Active deal in progress" badge — selectable, per the
  brief's minimal-behavior-change default (no exclusivity rule invented; flip
  to a hard block is a one-line change in `create_territory_deal` if a future
  call decides it should).
- **Add-another-territory**: enabled for the prospect's assigned rep and
  executives; a clearly disabled (never crashing) affordance otherwise.
- **Dashboard `DEAL` feed item** (`computeMultiDealFeed`): the required piece
  that stops a Funded/Won customer's in-flight second negotiation from going
  invisible now that the customer-level stage sits at its MAX. Role-scoped
  identically to the E-3 resource feed (rep-own / exec-all / null-fail-closed).
- **Migration `20260716280000_multi_deal_ui_read_grants.sql`**: single
  additive `grant select (deal_status, funded_won_at)` — the two PR-A columns
  postdate the Round-1 enumerated column grant. Read-only; the PR-A write
  lockdown untouched.
- `resolveProspectTerritory` call-site reviewed per the brief's instruction —
  exactly one consumer (the header chip, which genuinely wants a single
  "primary territory" summary) — kept as-is; the panel carries the full list.

1467/1467 tests pass; 17/17 deploy-preview QA checks passed walking the live
`MDFIX Dr Multi-Deal` fixture (deal#1 Funded/Won + deal#2 Proposal Sent) as both
rep and executive seats in a real browser, credentials never echoed. Two
harness bugs found and fixed during that QA run (TopBar search input colliding
with the dialog's own search selector; CSS-uppercase `innerText` vs. mixed-case
assertions) — both confirmed test-driver issues, not product defects, by
reading the actual dialog code, not just trusting the claim. Fixtures fully
torn down after (confirmed: 28 deals / 56 prospects / 0 residual rows).

**Independently verified by Chat:** file-level diff confirmed zero overlap with
PR-A (not merely the claimed "branched independently"); the read-only migration
confirmed already live before merge; full diff read, including
`computeMultiDealFeed`'s leading-stage-exclusion logic (a co-leading deal at the
customer's own max stage is correctly excluded from firing as its own "second
deal" notification) checked directly against its test coverage. Production
deploy confirmed live via Netlify: deploy `6a59bf55...`, `commit_ref: c2f4f99`,
published 2026-07-17T05:37:11Z, secret scan clean across 3,045 files.

## Decisions logged this cycle

| # | Substance | `related_pr` |
|---|---|---|
| #175 | Multi-Deal Pipeline Architecture — PR #142 + PR #143 merged and independently confirmed live in production; partial revision of decision #53 item (A) | 142 |

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| E-2 (Community Board) | — | SHIPPED + QA-CLOSED (unchanged) |
| E-3 (Resource Library, structure only) | — | SHIPPED (unchanged) |
| Deploy-preview QA for PR #136 | Trace, then Coder | Never performed — carry forward unchanged |
| **Multi-Deal Pipeline Architecture** | — | **SHIPPED this cycle** (PR #142 `dcfa932` + PR #143 `c2f4f99`, decision #175). Was previously the standing "deferred since PR #139 Round 4" item — now complete. Remove from future "what's next" framing. |
| Session E next module | Trace authorization per #159 | Next *would be* **E-4 (Email & SMS Template Gallery, §4C.5)** — **not confirmed, confirm with Trace at session start** |
| E-5 blocked on a Trace call | Trace | Webinar registration source (Calendly vs. Zoom webhook) still undecided |
| **No DB-level exclusivity on a still-available territory pre-close** | future Coder/Trace | Two different prospects can each hold an active deal on the same `available` territory today — confirmed live evidence (the `MDFIX` fixture's Territory Beta deliberately carried two prospects' active deals for QA). The territory picker surfaces this as a non-blocking badge by deliberate design (brief §5), not an oversight. Revisit only if this becomes a real commercial conflict in practice. |
| **Second deal-close does not re-ring the E-1 bell** | Trace (a call, not a bug) | The Community Board celebration/bell keys off `prospects.funded_won_at`'s *first* transition only. A repeat customer's second (or third) territory close is silent on the bell/scoreboard. Flagged, accepted, in decision #175 — revisit only if the business wants every close celebrated, not just a customer's first. |
| **No per-deal qualification-review artifact** | future Coder, if ever needed | A second deal's qualification-gate crossing re-checks the *customer-level* `proceed` review (which passes) — there's no schema for a distinct per-territory qualification decision. Deliberately not invented this cycle (brief said flag, don't silently build). |
| **No CI test-runner workflow in this repo** | Trace, low priority | Discovered/confirmed during this cycle's independent verification — `.github/workflows/` has the gate, review bots, and Netlify build checks, but nothing runs `npm test`/`npm run build` as a required GitHub check on any PR. Not new to this cycle, not a defect in #142/#143 specifically — but it means "tests pass" has never been GitHub-verifiable for any PR in this project; Chat verification has always had to rely on reading the underlying logic/DB state directly rather than a green CI check. Worth a deliberate call on whether to add one. |
| Dashboard service-role RLS bypass (`src/lib/dashboard/data.ts`) | future Coder | Unchanged |
| QA/deploy-preview credential isolation (#165) | Trace, then Coder | Accepted residual risk, on the backlog |
| `preview-login.ts` decision citation | future Coder, opportunistic | Docstring still cites #146; correct origin is #165. Fix opportunistically only |
| Rep provisioning | Trace | Two QA rep seats exist as fixtures (both now exercised in this cycle's adversarial probes); real reps still unprovisioned |
| AC5 forward-going state population (E-0b) | future QA | Still code/build-verified only |
| No rep INSERT/UPDATE policy on `prospects` | future Coder | Unchanged. Note: the multi-deal write model now routes rep-facing writes through deal-scoped governed RPCs instead, so this gap's practical exposure hasn't grown — but the underlying policy absence is still unchanged |
| No DB-level check `assigned_rep_id` → `designation='rep'` | future Coder, low priority | Unchanged generally; `create_territory_deal()` independently re-derives this per-call for its own path, so this specific new write path isn't exposed to it |
| TopBar global search — nullable-status exposure | future Coder | Unchanged |
| Legacy ArcGIS sold-territory import (#141) | Trace | Unchanged, deferred |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, #136/#137) | Still live by explicit ongoing decision |
| Demo/test data cleanup | future Coder | Unchanged |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Unchanged, paused externally |

## Carried forward — still true, do not "fix" these

- **Retired QA Rep A UUID (`de190bae-…`)** still appears in two files on purpose
  (an applied migration + a test assertion). Live database holds zero
  references. Current QA Rep A UUID is `6ef1bb8b-e133-4861-b176-bed75b5f206a`;
  QA Rep B is `9ea663c9-…` — both exercised in this cycle's adversarial probes.
- **The `MDFIX` fixture set used for this cycle's QA is fully torn down.**
  Confirmed live: 28 deals / 56 prospects / 0 residual rows, back to the exact
  pre-QA baseline. No lingering references anywhere — unlike the QA Rep A UUID
  above, there's nothing here that persists on purpose.
- **NIP remains fully off-limits** (`kjweckggegifjmmqccul` / `ghmdnetwork.netlify.app`).

## Note on `AUTH_GATE_DISABLED`

Unchanged: deliberate, ongoing decision (#136/#137), not a lapsed oversight.
Still live in production. Continue noting it every go-live-readiness session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
