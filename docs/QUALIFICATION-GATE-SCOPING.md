# Lead Qualification Gate & Territory-Authoring Precondition — Scoping

**Status:** Scoping/design only. Nothing here is implemented, migrated, or live.
**Authorization:** This chat session (2026-07-09), pending Trace's line-by-line approval before a Coder brief issues.
**Relationship to other docs:** This governs the *gate in front of* territory authoring. `TERRITORY-METHODOLOGY.md` §8 and `V3-DRIVE-TIME-SCOPING.md` govern what happens *after* the gate opens (sizing, boundary, overlap). Where this doc and `docs/AGENTS.md` conflict on the pipeline stage count, this doc's change supersedes on Trace approval and `AGENTS.md` must be updated in the same PR.

---

## 0. Bottom line

Territory sizing and proposal generation for a prospect-linked territory must not be reachable until that prospect has cleared a qualification review tied to their first meeting (live or Zoom). This is a **hard gate** — no route, no button — not a warning. The gate is a new pipeline stage, a new decision record, and a real per-rep access-control model. It does **not** require rebuilding a separate "operator" entity, and it does **not** require Zoom/AI transcript scoring to ship before the gate can be used.

---

## 1. Problem statement

Sizing and proposal generation are real cost and real exposure: Mapbox/census cycles, and — more importantly — financing figures and scarcity-messaged language (already legal-flagged under decisions #68/#71) landing in front of a prospect who was never going to close. The first meeting (live or Zoom-recorded) is the actual qualifying event. Nothing downstream of it should be reachable until a human (Trace, today; execs later) has recorded a real proceed/conditional/not-qualified judgment — and reps should never see the mechanics of *why*, only the outcome and a summary, consistent with Hard Rule 1's spirit even though this isn't formula mechanics.

---

## 2. Pipeline change (locked-fact update required)

**New stage inserted** between **Discovery Call Met** and **Proposal Sent**. Working name: **Qualification Review**. This changes the pipeline from 11 stages to 12 and renumbers everything after it.

This is a change to a `docs/AGENTS.md` "Locked Technical Fact" (the 11-stage pipeline). Required alongside the code change, not after it:
- `ops.decision_log` entry (Chat-authored, sanctioned path only) documenting the stage insertion and renumbering.
- `docs/AGENTS.md` pipeline-stage list updated to 12 stages in the same PR.
- `src/lib/pipeline-stages.ts` remains the single code source of truth; doc must match code exactly post-change.

No live prospects are affected — all 12 rows currently in `prospects` are `seed-demo.ts` fixture data, not real pipeline (verified this session). This ships clean.

### 2.1 Relationship to the existing `skipped_triage` soft gate (decision #110)

`prospects.skipped_triage` (decision #53) and the qualification decision this build creates are the same underlying fact, tracked in two disconnected, half-built systems — the column's own comment describes it as "advanced to Proposal Sent without a completed triage," which is exactly what Qualification Review now formally gates. Once the hard gate is real, the soft badge is redundant, not additional protection.

**`skipped_triage` is deprecated in place as part of PR2** — code stops setting it; the column is not dropped this build (future cleanup, same pattern already used for `reserved_for` and `deals.stage`). This is a **partial revision of decision #53**: only the `skipped_triage` portion is affected. `skipped_funding_prequal` and `call_scores`' rep-visible design, both also from #53, are untouched.

---

## 3. Data model

### 3.1 Retire `operators` — fold scoring onto `prospects` directly

The `operators` table is a 0-row stub ("full operators table built in Sprint 1 — replace entirely"). Given operator identity is confirmed to be the same identity as the prospect/lead — not a persistent entity surviving multiple deals — there is no reason to maintain a second, empty table pretending to be a distinct thing. **Sprint 1 (a full standalone operators build) is moot and out of scope.**

Proposal: retire `operators`, `operator_scores`, `operator_score_records`, `operator_enrichment` (all 0 rows, safe to drop/recreate cleanly) and replace with three tables keyed directly to `prospects.id`:

| New table | Replaces | Purpose |
|---|---|---|
| `qualification_scores` | `operator_scores` | The 13 scoring dimensions, unchanged in shape. `_source` enum (`enriched / ai_extracted / ai_derived / human_entered / human_override`) retained as-is — this is what lets Phase 2 (Zoom/AI) slot in later with zero schema change. All fields human-entered in Phase 1. |
| `qualification_enrichment` | `operator_enrichment` | Background context, not scored: `years_in_practice`, `existing_aesthetic_services`, `digital_footprint_present`, `prior_financing_relationship`. Working definition for `prior_financing_relationship`: prior evidence they financed comparable capital equipment (proxy for financeability), manually entered like `digital_footprint_present`. |
| `qualification_reviews` | `operator_score_records` | The decision record: `recommendation` enum **`proceed / conditional / not_qualified`** (renamed from `proceed/conditional/pass` — "pass" was ambiguous in both directions), `reviewed_by`, `reviewed_at`, `ai_summary` (text, populated in Phase 2), `notes`. **This is the field the territory-creation gate keys off.** `operator_score_composite`'s 6-12-month-calibration design carries over unchanged but is explicitly **not** the gate signal — `recommendation` is. |

`capital_status` (from the old `operator_score_records`) is **descoped from this table** — per Trace, it records financing *outcome*, which happens at proposal/deal stage, not at first-meeting qualification. Not carried into `qualification_reviews`.

### 3.3 Deal economics — descoped from this build, captured here so it isn't lost

Trace's intent for `capital_status` turned out to be much larger than one field — it's a real **deal-economics / margin-tracking module** on `deals`, not part of this build, but written down now rather than left to memory:

- Payment structure: outright vs. tranches, and the terms of each.
- Financing status: qualified / disqualified, and the accepted terms.
- Discounting: multi-location discount vs. single-deal discount, applied amount, and an **approval trail** — who (which rep) requested a discount, whether and by whom it was approved.
- Portfolio analytics derived from the above: average deal size, average margin, margin impact per discount, discount frequency by rep over time.

This is its own future scoping effort — comparable in size to this document or to `V3-DRIVE-TIME-SCOPING.md` — not a field addition. Recommend it join the standing decision queue as a named future item (working name: **Deal Economics & Margin Tracking**) rather than get scoped inline here. Not required for, and does not block, the qualification gate or territory authoring.

**"Conditional" / "needs more info" re-scoring:** edits the existing `qualification_reviews` row (and underlying `qualification_scores`) in place on a follow-up call, rather than creating a new one. `session_id` on `qualification_scores` is retained for future multi-session support but v1 UX is edit-in-place, not accumulate-and-compare.

### 3.2 Relationship to `deals.go_no_go` — not touched, flagged for later

`deals` rows represent the Territory Agreement record (`proposal_url`, `box_sign_envelope_id`, `territory_price`) and generally don't exist yet at Discovery Call Met — so `deals.go_no_go`/`go_decision_at`/`go_decision_by` is a **later, separate checkpoint**, not the same moment as `qualification_reviews.recommendation`. This build does not modify `deals`. Whether the two checkpoints should eventually be reconciled or reference each other is a future note, not a blocker here.

---

## 4. Rep grading (call performance) — new, exec-only, not `call_scores`

`call_scores` is locked under decision #53 as **rep-visible self-coaching**. What's being described here — exec-only visibility, used for managing/training reps, hidden from the rep being graded — is close to the opposite visibility rule. Reusing `call_scores` would mean quietly reversing a locked decision inside an unrelated build.

Proposal: a new table, **`rep_call_grades`**, exec-visibility-only from creation (enforced via RLS against `internal_users.designation = 'executive'`, same pattern as the existing territory exec-gate from PR #88). Shape TBD in detail during the build brief — flagged here as a small, separate design pass, not a blocker to the rest of this scoping.

---

## 5. Visibility model

| Role | Sees |
|---|---|
| **Executive** (Trace today; `internal_users.designation = 'executive'`) | Full `qualification_scores` detail, `qualification_reviews.recommendation` + **`ai_summary`** (once Phase 2 lands), `rep_call_grades` for all reps, all prospects regardless of assignment. |
| **Rep** | `qualification_reviews.recommendation` + **`ai_summary`** (same summary text as the executive sees — the *reasoning*, not the underlying dimension scores) for their own assigned prospects only, can add notes to it, **no** visibility into `rep_call_grades`, **no** visibility into other reps' prospects. |

Both roles see the AI summary once it exists (Phase 2) — it's the *why*, and both roles need the why to act on it. What's exec-only is the underlying `qualification_scores` detail and `rep_call_grades`, not the summary.

---

## 6. Access control — real, not cosmetic (own migration)

`prospects.assigned_rep` is currently free text (`default 'leif'`), not tied to a real identity — it cannot support a genuine "reps only see their own leads" guarantee, only a UI-level filter that a direct API call could bypass. Given this project's own Hard Rule 10 history (a real RLS gap that sat undetected for a day under decision #101→#105), this gets built correctly from the start:

- `assigned_rep` becomes a proper FK to `auth.users` (or reuses the `internal_users` pattern), not a name string.
- New RLS policies on `prospects`, `qualification_scores`, `qualification_enrichment`, `qualification_reviews`, `rep_call_grades`: rep role sees rows where `assigned_rep = auth.uid()`; executive role sees all. Mirrors the `internal_users_all` pattern from decision #105's remediation — same shape, new tables.
- This is real migration + RLS work, not a UI filter. Sized accordingly in the brief (ultrareview tier per `docs/AGENTS.md` — this is squarely "auth, RLS, roles" territory).

---

## 7. The gate itself

- **Stage-advancement gate (widened per decision #110):** a prospect cannot advance past the Qualification Review pipeline stage unless `qualification_reviews.recommendation = 'proceed'` for that prospect. This is the actual enforcement point — it closes the gap where stage could be manually bumped past Qualification Review without a real review existing underneath it.
- **Territory-creation gate:** territory creation (route + UI affordance, wherever it lands per the earlier territory-authoring scoping) is **unreachable** for a prospect-linked territory unless that prospect has cleared the stage-advancement gate above. This is now a consequence of the stage gate, not a second independent check.
- **Standalone/speculative territories** (no prospect attached) remain exempt — there is no meeting to gate on. Two paths, not a contradiction, per Trace's earlier confirmation.
- No route, no rendered button, no enabled stage-advance control — absence, not a disabled/explained state. Matches the earlier UI decision (solo-operator context; revisit the explained-block pattern once reps are added).

---

## 7.1 Speculative territories — separate nav surface, executive-only

Speculative/standalone territories (no prospect attached, per §7) don't just skip the gate — they get their **own top-level nav item**, distinct from the existing prospect-linked territory surface, visible only to executives. This lets Trace (and future execs) run scouting/market analysis independently of any live deal, without it mixing into the deal-linked territory list reps will eventually see.

- **Nav addition:** **Territory Scouting** — new sidebar item, exec-only, standalone/speculative territories only.
- **Existing "Territories" nav item renamed to Deal Territories** — prospect-linked-only going forward: sold/approved/in-review territories tied to a real deal. Standalone rows move out of this list into Territory Scouting. "Deal Territories" was chosen specifically to read as the clear opposite of "Territory Scouting" — one is tied to a real deal, one isn't — rather than a name that could be mistaken for the prospect pipeline itself.
- **Access control:** approved — reuses the existing `internal_users.designation = 'executive'` gate already built for the sizing/approve panel (PR #88), applied to the whole nav item. Confirmed as a narrow, precedented reuse, not an opening of the broader Platform RBAC decision-queue item.

---

## 8. Zoom / AI scoring — Phase 2, explicitly deferred

Not built in this phase. Deferred by explicit Trace decision (manual first, to develop and validate the rubric before trusting AI extraction against it). Because `qualification_scores._source` already models `ai_extracted`/`ai_derived` alongside `human_entered`/`human_override`, Phase 2 is additive — no schema rework needed to plug in Zoom transcript ingestion + AI scoring later. Phase 2 scoping (Zoom Cloud Recording/transcript retrieval, AI extraction pipeline, mapping onto the same 13 dimensions, rep-grading extraction) is its own future document, written once Phase 1 has real manual data to calibrate against — same reasoning the v3 buffer multiplier used ("revisit after real data exists").

---

## 9. Rollout / sequencing

**Phase 1 (this brief, once approved):**
1. Migration: retire `operators`/`operator_scores`/`operator_score_records`/`operator_enrichment`; create `qualification_scores`/`qualification_enrichment`/`qualification_reviews` keyed to `prospects.id`; create `rep_call_grades` (exec-only RLS).
2. Migration: `assigned_rep` → real FK; RLS policies across the five affected tables.
3. Pipeline: insert Qualification Review stage; `pipeline-stages.ts` + `docs/AGENTS.md` + decision-log entry.
4. UI: qualification form/review action at the new stage (exec issues `recommendation`; rep views summary + adds notes; exec-only `rep_call_grades` entry).
5. Gate: territory-creation affordance checks `qualification_reviews.recommendation = 'proceed'` for prospect-linked territories only.
6. Nav: rename "Territories" → **Deal Territories** (prospect-linked only) and add new **Territory Scouting** (standalone, exec-only) per §7.1.

**Phase 2 (separately scoped, later):** Zoom ingestion + AI extraction + AI summary generation, once Phase 1's manual rubric has real calibration data.

**Future, not scoped here:** Deal Economics & Margin Tracking (§3.3) — recommend adding to the standing decision queue.

---

## 10. Open items (small, non-blocking)

1. Exact field shape of `rep_call_grades` — deferred to the build brief itself, not a scoping blocker.
2. Whether `deals.go_no_go` and `qualification_reviews.recommendation` should ever cross-reference each other — noted, not resolved, not required for this build.

**No blocking flags remain — naming and access control for §7.1 are both resolved.**

**No blocking flags remain.** Everything above reflects decisions actually made in this session, not defaults invented to fill gaps.
