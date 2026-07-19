# GHMD Sales Platform — Handoff v2.55

Date: 2026-07-18 | Prepared by: Coder (content briefed by Chat) | Purpose: record the
adoption of **GHMD-CRM-003 v1.0 — APPROVED** as the governing architecture and delivery
document for this platform (decisions #177 and #178), and the repo-governance alignment
that implements it: the SALES-OS-SPEC **Session E queue is FROZEN**, delivery order is
now CRM-003's Phase 0–4 plan, and the "12-stage pipeline" Locked Technical Fact is
amended to note its supersession by the ten-stage Opportunity workflow at Phase 1
cutover. Without this alignment, standing session-start protocol would have routed the
next Coder session straight into superseded work (CRM-003 §10). Supersedes v2.54.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open
> PRs, and security-advisor status are derived live at every session start (git,
> `ops.decision_log`, `get_advisors`). This handoff carries **narrative only** —
> what shipped and why, the judgment calls, the residual risks, and the queue.
> If you need HEAD or the decision-log tip, go get them live. Do not cite this
> file for them.

## What to do first (next session)

**The program has pivoted.** GHMD-CRM-003 v1.0 is approved and governing. Read
`docs/GHMD-CRM-003.md` before scoping anything. Delivery order no longer comes from
SALES-OS-SPEC.

1. **Session E is FROZEN — do not resume it.** This reverses v2.51/v2.52/v2.54's
   standing orientation toward **E-4 (Email & SMS Template Gallery)**. E-4, E-5, and
   any successors are frozen per GHMD-CRM-003 (decision #177). `docs/SALES-OS-SPEC.md`
   remains accurate for the **live legacy system as deployed** until Phase 1 cutover,
   but it no longer defines delivery order. **Next authorized work: Sprint 0.1, the
   Phase 0 emergency containment wave (PR-0a, PR-0b, PR-0g, PR-0d-interim; ultrareview
   tier), brief to be issued by Chat.** Sprint Discipline is unchanged — confirm the
   sprint with Trace at session start; do not infer authorization from position in a
   queue.
2. **A v1.1 administrative consolidation of CRM-003 precedes Sprint 0.1** (Chat
   drafts; administrative acknowledgment by Trace/Bruce). It is consolidation, not
   reopened architecture — one genuine decision inside it is already ruled (#178).
   See "Sol's post-approval review" below for its contents.
3. **Multi-deal architecture — RESOLVED (prior cycle).** Was v2.52's standing-queue
   item ("deliberately deferred since Round 4 of PR #139... still not scoped or
   started"). It has now shipped in full: PR #142 (schema + governed write paths,
   `dcfa932`) and PR #143 (UI: deal-history panel, territory picker,
   add-another-territory, dashboard feed, `c2f4f99`), both merged, both
   independently confirmed live in production. Decision #175 logged. Nothing
   further required to close this thread — see Standing Queue for the residuals
   it left behind, which are accepted, not open work.
4. **Capability-stack cloud-portability is still an open question (decision #176).**
   PR #145's config is live on `main` but was confirmed **non-functional** in a real
   `claude.ai/code` session — `hookify` and `remember`, two of the 13 committed
   plugins, both returned "Unknown skill," and the tested session's plugin/skill
   surface matched Trace's full claude.ai account inventory rather than this repo's
   committed 13-plugin subset. Before treating this as solved or building further on
   it, the open mechanism needs investigation — worth checking Anthropic's current
   docs/support on how `claude.ai/code` actually sources plugins, since it does **not**
   appear to read a repo's committed `.claude/settings.json` `enabledPlugins` the way
   local Desktop does. **Do not assume "merged" means "working" here.**

## What happened this cycle — GHMD-CRM-003 v1.0

**The v0.99 correction pass** was executed by Chat, adjudicating the Sol 5.6 review of
2026-07-17. Ten of Sol's corrections were accepted as written. Correction **#2** was
accepted under Trace's **"Reading A"** reclassification — the hardcoded-UUID
authorization mechanism is reclassified as *implementation detail written into the
decision text*, replaced by a governed `authority_assignments` table; **the business
rule is unchanged** (named-individual authority — Trace or Bruce specifically — never
designation-tested, expansion only by deliberate future sign-off). Corrections **#1**
and **#7** were accepted with modification. Chat added four items of its own:

- the **#136/#137 revision prerequisite for PR-0a** — the `ops.decision_log` entry
  revising those standing decisions must land before or with PR-0a, never a migration
  that silently contradicts the log;
- the **`gate_decision_for_pr` CI-dependency caveat** — its public executability may be
  load-bearing for the Second-Opinion Gate workflow; verify how
  `.github/workflows/second-opinion-gate.yml` authenticates **before** any revoke;
- the **preview-login redesign inside PR-0c** — the QA-exec hostname-guard model is
  premised on the single-Supabase-project topology that environment separation
  dissolves;
- **this repo-governance alignment** (CRM-003 §10).

**T-1 executed:** GHMD-CRM-001 reference material transcribed into Appendix A with five
inline discrepancy flags, all resolving in favor of CRM-003.

**§12 items 2 and 5 resolved** with counsel input obtained by Trace. *Retention:* the
2-year figure is a **minimum**, not an auto-delete trigger, and applies **only to deals
that do not close**; all closed-deal records live permanently in Box; system default is
**never auto-delete** anywhere. *New proposal content:* **Option A** — fresh off-system
counsel review for every new claim/ROI/earnings-adjacent item, with a Phase 2
submission-UI gate.

**v1.0 approved in full: Trace Herchman 2026-07-18 7:16 PM, Bruce Vermeulen 2026-07-18
7:20 PM.** GHMD-CRM-003 supersedes GHMD-CRM-001 and GHMD-CRM-002 effective that date.

### Sol's post-approval review (2026-07-18)

Verdict: **treat v1.0 as approved; do not reopen architecture.** Eleven residual items
were adjudicated by Chat. **Top residual risk is migration/cutover** — there is no
governing migration strategy yet, and CRM-001 §17 has not been transcribed.

Disposition: a **v1.1 administrative consolidation** is planned, carrying —

- CRM-001 §2 decision register as Appendix A.0;
- CRM-001 §17 migration baseline plus a governing migration section;
- a canonical ER diagram;
- a harmonized Appendix A with historical redline;
- the full named-person authority gate matrix, including #178;
- Sol's simplified auth-guard rule folded into PR-0a's spec — bypass permitted **only**
  in explicit local dev with synthetic data; **every hosted Netlify context fails
  deployment if enabled**;
- PITR + a timed restore test + the Pilot Runbook as **hard preconditions before the
  first real lead**;
- a channel-consent-compatible Contact schema note;
- the `authority_assignments` write path hardened to migration/DB-owner or one
  dedicated audited admin procedure — **no general service-role endpoint**;
- a retention-operations addendum for PR-0i: Box retention-policy configuration, legal-
  hold mechanism, the narrowly-controlled counsel-directed deletion path, and Contact
  correction/deletion-request handling. **The last item gets a Rick Dahlson check when
  the PR-0i retention runbook is drafted — not improvised.**

## What shipped this cycle

### PR (this one) — Sprint G: commit GHMD-CRM-003 v1.0 + docs-alignment [standard tier]

Docs-only; no code paths, migrations, schema, or UI. Five files:

- `docs/GHMD-CRM-003.md` — the signed governing document, committed **byte-for-byte**.
  Integrity verified before commit: sha256
  `a02b3ba9d3918cc8b2f5f4c9181ef5e5221eccf527743d484ca68cb03e1e4ccb`, 63620 bytes.
- `docs/SALES-OS-SPEC.md` — governance-notice banner added below the header block; E-4
  and E-5 marked `FROZEN per GHMD-CRM-003 (decision #177)` individually. **Nothing
  deleted** — the queue is history and stays legible.
- `docs/AGENTS.md` — new **Canonical Documents** list (CRM-003 added as governing;
  SALES-OS-SPEC annotated "live legacy system only; Session E queue frozen"); the
  12-stage Locked Technical Fact **amended, not deleted**; delivery-order line added.
- `CLAUDE.md` — standing rule **19** added. No existing rule renumbered.
- `handoffs/LATEST.md` — this file.

## Shipped in the prior cycle (v2.54) — carried for context

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

### PR #145 — MERGED (`1798c93`) — Repo-portable `enabledPlugins` for secret-free official plugins [standard/review tier]

Committed a 13-plugin `enabledPlugins` block to `.claude/settings.json` (1 file, 15
insertions) — `superpowers`, `code-review`, `pr-review-toolkit`, `security-guidance`,
`claude-md-management`, `frontend-design`, `skill-creator`, `claude-code-setup`,
`code-simplifier`, `commit-commands`, `feature-dev`, `hookify`, `remember`, all
`@claude-plugins-official`. Each was manifest-verified as a pure skill/command/agent/
hook plugin with **no bundled MCP server and no local-secret dependency** — the
structural portability test being that a plugin is git-portable only if it declares no
`.mcp.json` / `mcpServers`. `github` (needs `${GITHUB_PERSONAL_ACCESS_TOKEN}`),
`supabase` (remote-OAuth MCP, zero local secret), and the machine-specific/non-official
plugins were deliberately excluded. `permissions.deny` untouched; diff pure booleans,
zero secrets.

**Stated objective NOT achieved.** The PR's goal — making this stack available in a
`claude.ai/code` cloud session — was live-tested this same cycle and **failed**:
`hookify` and `remember` both returned "Unknown skill" in a confirmed cloud session
(decision #176, OPEN, `residual_risk: unresolved`). The committed config is harmless
and is being **retained**, but this is the project's established **"merged ≠ applied"**
pattern — do not let a future reader equate the merge SHA with a working capability.
The real close-out (verified-in-a-live-cloud-session) is still outstanding; see the
Standing Queue.

## Decisions logged this cycle

Written by Chat (Hard Rule 18 — Coder never writes `ops.decision_log`). **#178 was the
tip at time of writing; re-derive the live tip at session start, do not cite this file.**

| # | Substance | `related_pr` |
|---|---|---|
| #177 | GHMD-CRM-003 v1.0 adoption — governing architecture and delivery document; supersedes GHMD-CRM-001/002 effective 2026-07-18. Status ADOPTED, `residual_risk` **accepted** | — |
| #178 | Disposition authority split — the Analyst may approve **Not Ready / Nurture**; **Closed Lost requires Trace or Bruce** via `authority_assignments`. Status ADOPTED, `residual_risk` **none** | — |

**A Locked-Fact supersession entry follows this PR's merge** — Chat writes it once the
squash SHA is reported, covering the 12-stage → ten-stage supersession recorded in
`docs/AGENTS.md`.

### Logged in the prior cycle (v2.54)

| # | Substance | `related_pr` |
|---|---|---|
| #175 | Multi-Deal Pipeline Architecture — PR #142 + PR #143 merged and independently confirmed live in production; partial revision of decision #53 item (A) | 142 |
| #176 | Capability-stack cloud-portability (PR #145) — committed, confirmed non-functional in claude.ai/code; status OPEN, residual_risk unresolved | 145 |

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| E-2 (Community Board) | — | SHIPPED + QA-CLOSED (unchanged) |
| E-3 (Resource Library, structure only) | — | SHIPPED (unchanged) |
| Deploy-preview QA for PR #136 | Trace, then Coder | Never performed — carry forward unchanged |
| **Multi-Deal Pipeline Architecture** | — | **SHIPPED this cycle** (PR #142 `dcfa932` + PR #143 `c2f4f99`, decision #175). Was previously the standing "deferred since PR #139 Round 4" item — now complete. Remove from future "what's next" framing. |
| **Session E queue (E-4, E-5, successors)** | — | **FROZEN per GHMD-CRM-003 (decision #177).** Supersedes the prior "next module *would be* E-4" framing. No session may resume it. Not deleted from `docs/SALES-OS-SPEC.md` — kept as history |
| E-5's undecided webinar registration source (Calendly vs. Zoom webhook) | — | **Moot while E-5 is frozen.** Retained only so the open question isn't lost if Events is ever revived under the CRM-003 phase plan |
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
| **Cloud-portability mechanism unresolved (decision #176)** | future Coder, opportunistic | Why doesn't a confirmed `claude.ai/code` session read this repo's committed `enabledPlugins`? Not yet investigated. Re-test once understood — don't assume PR #145 solved anything until it does. |
| **`supabase` plugin: pure-OAuth include/exclude policy call** | Chat/Trace | PR #145 verified `supabase`'s MCP server is remote-OAuth with zero local secret — structurally eligible for inclusion, but deliberately excluded from PR #145 pending a Trace decision (touches `ops.decision_log` infra exposure). Still undecided. |
| **`docs/AGENTS.md` "netlify-skills and typescript-lsp are Project-scoped" wording** | future Coder | Confirmed misleading this cycle — "Project" in Claude Code's UI means keyed to a local path in `~/.claude.json`, not committed to git. Neither plugin is actually repo-portable. Needs a wording fix by PR; not done this cycle, deliberately out of scope for PR #145. |

## Delivery queue — CRM-003 order (replaces the Session E queue)

Session E is frozen (this PR). Work proceeds in this order:

1. **v1.1 administrative consolidation of CRM-003** — Chat drafts; administrative
   acknowledgment by Trace/Bruce. Consolidation, not reopened architecture; the one
   genuine decision inside it is already ruled (#178).
2. **Sprint 0.1 — Phase 0 emergency containment wave** — PR-0a (restore authentication
   + deployment guard), PR-0b (revoke anon/authenticated writes on PostGIS system
   objects), PR-0g (credential review and rotation — **rotations performed by Trace
   directly in the respective consoles, never through an agent session**; Coder only
   verifies no secrets remain in repo history), PR-0d-interim (triage of accidental
   anon-executable privileged functions). **Tier: ultrareview.**
3. **Sprint 0.2 — environment separation** (PR-0c), then the rest of §7 per CRM-003.

**Phase 1 is preceded by three specs**, none optional: the **Schema Contract**, the
**Permission & Audit Matrix**, and the **Migration & Cutover Brief**.

## Standing — unchanged by this cycle

- **Legal flags #68/#71 are untouched** and continue to **independently block live
  prospect sends**, regardless of anything CRM-003 authorizes.
- **`AUTH_GATE_DISABLED` remains the deliberate standing state** until PR-0a supersedes
  #136/#137 with its own decision-log entry. It is a choice, not a lapse.

## Session close

This handoff update satisfies the session-close rule for the **2026-07-18 Chat session**
(decision-log writes #177 and #178).

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
**CRM-003 §4 and §7.1 now put an end date on it:** PR-0a restores authentication and
fails closed in a real-data context, and its decision-log entry revising #136/#137 is a
stated **prerequisite** for that PR — the log entry lands before or with the migration,
never after.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
