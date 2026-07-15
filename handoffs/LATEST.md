# GHMD Sales Platform — Handoff v2.51

Date: 2026-07-14 | Prepared by: Coder (content briefed by Chat) | Purpose: close out
the PR #135 + PR #136 arc — the §4D Rep Command Center spec addendum (PR #135) and
E-3 Resource Library, structure only (PR #136, ultrareview, **two** Second-Opinion
Gate BLOCKs, both resolved). Decisions #169 + #170 + #171. Supersedes v2.50.

> **State facts are never read from this file.** Main HEAD, decision-log tip, open
> PRs, and security-advisor status are derived live at every session start (git,
> `ops.decision_log`, `get_advisors`). This handoff carries **narrative only** —
> what shipped and why, the judgment calls, the residual risks, and the queue.
> If you need HEAD or the decision-log tip, go get them live. Do not cite this
> file for them.

## What to do first (next session)

**Two unstarted threads now compete for "next" — this handoff deliberately does not
resolve which comes first. That is Trace's call.**

1. **Session E's next module.** E-3 was module 3 of 4 in the Session E sequence
   (decision #159). Per `docs/SALES-OS-SPEC.md` §4C the next module *would be* **E-4,
   the Email & SMS Template Gallery** (§4C item 5 — "lives in Resources", merge fields,
   tracked links). Naming it here is orientation only: **Sprint Discipline requires
   confirming the current module with Trace at session start — do not infer
   authorization from position in the queue** (the exact rule v2.50 applied to E-3, and
   it held: E-3 was not started until Trace gave an explicit go-ahead).
2. **Rep Command Center** (§4D, the PR #135 spec addendum). Its feature brief — the
   `§4D` migrations plus the `/rep-command-center` executive-only UI — is **fully
   drafted and Trace-confirmed from a prior session, but has NOT been dispatched to
   Coder.** State it exactly as it is: drafted, confirmed, not sent. Do **not** imply it
   is next.

Neither is authorized to start. Confirm the intended thread with Trace before writing
any code.

## What shipped this cycle

### PR #135 — MERGED — §4D Rep Command Center spec addendum (docs-only)

A pure-docs spec addendum: added **§4D — Rep Command Center (executive-only, fully
concealed from reps)** to `docs/SALES-OS-SPEC.md`, between §4C and §5. Executive-only
manager view of per-rep performance including gross-vs-net (discount-aware) close value,
discount frequency by reason, deal-cycle time, two closing-rate variants, and per-deal
drill-down; routing returns a **404 indistinguishable from the real 404** to non-execs
(concealment of existence, not just access denial). This PR predates the E-3 session and
carried a **genuine, verified `Handoff: not needed` opt-out** (pure docs, no code path).
It is recorded here only because its bound decision closed inside this cycle.

**Decision #169 — discount governance — was Trace's call.** It formalizes a discount-
authorization practice that had been happening informally and repeatedly across licensee
deals (the `deals.discount_reason` / `discount_authorized_by` CHECK and the
`discount_authorizing_designations` seed that §4D introduces). This was **Trace's
determination**, not an independent Chat or Coder assessment — do not flatten it into
"the team decided."

### PR #136 — MERGED (`ada9ab8`) — E-3 Resource Library ("Field Kit"), structure only [ultrareview]

Ships the Resource Library **structure only** — **zero real collateral**; all six
categories (`decks · testimonial_videos · case_studies · clinical_evidence ·
business_opportunity · objection_playbook`) render genuine empty states. Real content is
Trace's separate production track (spec §4C.3), not this PR.

What landed:

- **Three new RLS-gated tables.** `resource_assets` (executive-only INSERT/UPDATE, no
  client DELETE — soft-delete via `active`; a rep sees `active=true` only, an exec sees
  all). `resource_shares` (per-rep, per-prospect tracked links; `rep_id` server-stamped
  from `auth.uid()` by a BEFORE INSERT trigger; `prospect_id` NOT NULL; unguessable
  96-bit token; open-tracking columns **not** client-writable). `resource_engagement_events`
  (service-role-only, RLS-enabled-no-policy — mirrors `proposal_events` exactly). The
  `/r/[token]` open path is an atomic `open_resource_share()` **SECURITY DEFINER** function
  locked to `service_role` that logs exactly one `link_opened`, stamps the share, and
  returns **only** the redirect URL (zero internal-metadata leakage).
- **Routes:** `/resources` (six category cards, `Card`+`EmptyState`+design tokens — note
  the brief named a `DataTable` primitive that **does not exist** in this repo; the
  established `Card`/hand-rolled-table convention was used instead), rep share actions
  (Copy Link / Text / Email with a **required** prospect selection); and `/r/[token]`, a
  **public, no-auth** prospect-facing redirect (added `/r/` to `isPublicPath` — the
  trailing slash keeps it from matching the rep-facing `/resources` index).
- **Role-scoped dashboard feed:** resource `link_opened` events heat-sort alongside
  proposal engagement, rendered two ways from one data set — a rep sees opens on **their
  own** prospects, an executive sees **all** reps' opens, attributed by rep name.

**Second-Opinion Gate BLOCK #1 — a real defect, fixed.** The gate flagged that
`resource_shares_insert_rep_own` validated `rep_id`, rep designation, and asset-active —
but **nothing about `prospect_id`.** A rep could INSERT a share naming *any* prospect,
including one assigned to a different rep. That is not cosmetic: `computeResourceFeed()`
attributes each resource-open feed item by `prospects.assigned_rep_id`, **not** by who
created the share — so a forged share against another rep's prospect would surface as
**fabricated engagement in the victim rep's dashboard feed.** Root cause of the original
miss: the first adversarial pass tested `rep_id` forgery (blocked by the trigger) but
never the `prospect_id` axis of the same policy. Fixed in commit **`4579b02`** via a
**superseding** migration `20260714270000` (the applied `20260714250000` was *not* edited
— supersede-never-delete) adding a fourth WITH CHECK clause requiring
`prospects.assigned_rep_id = auth.uid()`. Because `assigned_rep_id` is nullable, an
**unassigned** prospect correctly fails for every rep (`NULL = auth.uid()` is never true).
Re-verified live: **20/20** role-simulated probes — the original 17 unchanged (no
regression, including the rep-INSERT-own positive control) plus three new `prospect_id`
probes (another rep's prospect → denied; own prospect → allowed; unassigned → denied).
Chat independently confirmed the live `pg_policy` WITH CHECK clause on the database, not
just the committed file.

**Second-Opinion Gate BLOCK #2 — a design question, not a defect — resolved by Trace as
Model A (decision #170).** The gate raised that the dashboard resource-feed scoping
follows the prospect's **current** `assigned_rep_id`, not the share-creator's `rep_id` —
so if a prospect is reassigned, the *new* rep sees the pre-handoff engagement. Trace
reviewed both models and **chose Model A** (current behaviour is correct and intentional):
it is consistent with the existing org-wide proposal-engagement precedent, and the new
rep already has full RLS access to the reassigned prospect, so no new boundary is crossed.
Model B (scope by share-creator) was **explicitly rejected** as worse — it would break
handoff continuity. This was **Trace's call** after Chat presented both models with their
tradeoffs; do not attribute it to Chat or Coder. Logged as decision #170 (a manual gate
override, precedent per decision #48).

Fixture cleanup (0/0/0 across all three tables) and the security-advisor diff (one
expected `resource_engagement_events` RLS-enabled-no-policy INFO — intentional, matches
`proposal_events`; `open_resource_share` confirmed **absent** from the anon/authenticated
executable lists, i.e. locked to `service_role`) were both independently re-verified live
by Chat, not relayed from Coder self-report.

## Second-Opinion Gate — routed, two BLOCKs, both cleared

PR #136 carried a `second-opinion-gate` classification block (**category 1** — RLS/auth
boundaries) and correctly routed through the gate. BLOCK #1 was a genuine RLS defect and
was fixed in code; BLOCK #2 was a design judgment Trace resolved by manual override. PR
#135, being pure docs, was **out of gate scope** — its `Handoff: not needed` opt-out was
verified, not assumed.

## Decisions logged this cycle

| # | Substance | `related_pr` |
|---|---|---|
| #169 | Discount-governance formalization for §4D (Trace's call) | 135 |
| #170 | Dashboard resource-feed scoping accepted as **Model A** (prospect's current `assigned_rep_id`); manual Second-Opinion Gate override (Trace's call, precedent #48) | 136 |
| #171 | PR #136 merge closure. Deploy-preview UI-render QA gap accepted (`residual_risk: accepted`). `related_pr` **NULL** per the one-bound-row-per-PR back-fill rule (#170 already carries PR #136) — referenced in text only | **NULL** |

## Standing queue — carry-forward (re-derive the live set; do not hand-renumber)

| Item | Owner | Status |
|---|---|---|
| E-2 (Community Board) | — | **SHIPPED + QA-CLOSED** (PR #130; AC10 fix PR #133; decisions #161/#162/#165/#166/#167/#168) |
| E-3 (Resource Library, structure only) | — | **SHIPPED** (PR #136, `ada9ab8`; gate-fix commit `4579b02`, migration `20260714270000`; decisions #159/#170/#171). Content unproduced by design. **Deploy-preview UI walkthrough still outstanding — see next row** |
| **Deploy-preview QA for PR #136** | Trace, then Coder | **Never performed — carry forward.** AC1 (UI render), AC2/AC4/AC6 (via UI), AC8 (feed render), AC9 (390px) all require **Trace to sign into the deploy-preview host first**, per the E-3 brief. All security-critical ACs (**AC3, AC5, AC6, AC7, AC10**) were proven live-DB pre-merge (17→20 probes). This is a **UI-render walkthrough gap, not an authorization gap.** Flagged `residual_risk: accepted` in decision #171 — carry until closed |
| **Rep Command Center feature brief** | Trace to dispatch | **Drafted + Trace-confirmed from a prior session, NOT yet sent to Coder.** §4D migrations + `/rep-command-center` UI. State as-is; not implied to be next |
| Session E next module | Trace authorization per #159 | E-3 was module 3 of 4. Next *would be* **E-4 (Email & SMS Template Gallery, §4C.5)**, then E-5 Events & Invites, E-6 Objection playbook. **Not confirmed — confirm current module with Trace at session start** (Sprint Discipline) |
| E-5 blocked on a Trace call | Trace | Webinar registration source (Calendly vs. Zoom webhook) still undecided — flagged in #159, not needed until E-5 |
| Dashboard service-role RLS bypass (`src/lib/dashboard/data.ts`) | future Coder | Unchanged. Note E-3's resource feed **is** role-scoped, but the existing proposal-engagement feed remains org-wide — that org-wide behaviour is the accepted **Model A** precedent (#170), not a bug to "fix" without a decision |
| QA/deploy-preview credential isolation (#165) | Trace, then Coder | Accepted residual risk, on the backlog. Separate preview Supabase project, or a QA designation with zero production RLS grants. **Revisit before any board/library carries real customer/deal-identifying content at scale** |
| `preview-login.ts` decision citation | future Coder, opportunistic | Docstring still cites **#146**; correct origin is **#165**. Fix opportunistically only if that file is touched for unrelated reasons — not worth its own PR. (PR #136 did not touch it.) |
| Rep provisioning | Trace | Two real rep seats exist (QA Rep A/B, #161) — a *fixture*, not a sales-team rollout. Real reps still unprovisioned |
| AC5 forward-going state population (E-0b) | future QA | Still code/build-verified only, not runtime-exercised |
| No rep INSERT/UPDATE policy on `prospects` | future Coder | Unchanged. **`prospects` is on column-level UPDATE grants** (E-1's `funded_won_at` lockdown): any new rep-write policy needs its columns explicitly granted, and must **not** include `funded_won_at` |
| No DB-level check `assigned_rep_id` → `designation='rep'` | future Coder, low priority | Unchanged |
| TopBar global search — nullable-status exposure | future Coder | Unchanged |
| Legacy ArcGIS sold-territory import (#141) | Trace | Unchanged, deferred |
| `AUTH_GATE_DISABLED` reversal | Trace (deliberate, #136/#137) | Still live by explicit ongoing decision |
| Demo/test data cleanup | future Coder | Unchanged |
| Box Sign / Territory License Agreement (#99-legal) | Bruce / counsel, then Coder | Unchanged, paused externally |

## Carried forward — still true, do not "fix" these

- **Retired QA Rep A UUID (`de190bae-…`) still appears in two files on purpose**: the
  already-applied migration `20260714170000_e2_qa_rep_provisioning.sql`, and the
  corresponding assertion in `e2-community-board.test.ts`. Applied migrations are immutable
  history. A Rule 0-E-style grep **will keep hitting these two — that is expected, not
  contamination.** The live database holds **zero** references to it. Current QA Rep A UUID
  is `6ef1bb8b-e133-4861-b176-bed75b5f206a`; QA Rep B was unaffected.
- **NIP remains fully off-limits** (`kjweckggegifjmmqccul` / `ghmdnetwork.netlify.app`) — see
  CLAUDE.md "NIP Separation" and the Hard Boundaries table in `docs/AGENTS.md`. Decision
  **#163** authorized one *separately-scoped* cross-project NIP session; it does **not**
  relax the standing boundary.

## Note on `AUTH_GATE_DISABLED`

Unchanged: deliberate, ongoing decision (#136/#137), not a lapsed oversight. Still live in
production. Continue noting it every go-live-readiness session.

## Agent Roles

| Agent | Scope |
|-------|-------|
| Chat | PM + planning + MCP ops; **sole `ops.decision_log` writer**; Supabase access is read-only |
| Coder | git + schema + code + migrations + live-DB deploy actions (fresh context each session) |
| Pilot | GitHub UI fallback only when CLI/MCP unavailable |
