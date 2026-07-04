# GHMD Territory Sales OS — Product Requirements Document v1.2

**Repo:** `ghmd-sales-platform` | **Date:** 2026-07-03 | **Owner:** Trace Herchman
**Status:** APPROVED IN SESSION — commit to `/docs/prd/` as first PRD artifact; log adoption to `ops.decision_log` (platform: `sales`)
**Supersedes:** v1.1 (this session) and v1.0 (this session, never circulated)

**v1.2 delta:** Conformed to repo main HEAD `306fdbd` (post-PR #55) after full reconnaissance. Single 11-stage state machine per `src/lib/pipeline-stages.ts` replaces v1.1's two-machine model. `deals` demoted to Territory Agreement record. Gate architecture finalized: capital gate soft (shipped), triage gate soft at 4→5 (new, approved), confidence/Tier-2 gates hard (locked #2). Baseline-migration task added for untracked base DDL. Sequential-sprint rule retired in favor of reconciliation precondition. Demo-first phasing. Retention framework draft added for counsel review.

---

## 0. Governing Constraints (non-negotiable)

1. **NIP is untouchable.** No shared code, keys, DB, or auth with `gethairmd-network`. Never reference `kjweckggegifjmmqccul` or `gethairmd-network` in `.ts`/`.tsx`. Net-new keys only (Recall.ai, AssemblyAI, Anthropic), scoped to this platform, Netlify env, redeploy after set.
2. **Track B decisions are LOCKED and govern this PRD:**
   - Capture stack (#8, #9): Recall.ai Meeting Bot API (bot "GHMD Call Notes"; notification at call open per #14 — ByrdAdatto-cleared, notification rule is capture-method-independent; Desktop Recording SDK is fallback only, never plan-of-record for a sales force) → AssemblyAI Universal-3 Pro + Medical Mode (BAA) → webhook → Supabase Edge Function → Claude API extraction. Whisper removed (#7). ~$0.87/hr all-in.
   - Capture Taxonomy v1 (#1, #20): canonical source `scripts/seed_capture_taxonomy.sql`; schema of record `supabase/migrations/20260629000000_operator_scoring_schema.sql`. Five source types; four-column pattern (value · source · confidence · notes) on every scored field; Group A enrichment walled off as non-scoring. There is no standalone taxonomy markdown — these two files are the reference.
   - Operator Score Architecture (#2): Tier 1 AI pre-score → Tier 2 human confirmation ≤24h (Leif validates independently) → triage `proceed / conditional / pass`, never AI-alone. Low confidence on any field is a **hard gate** on triage generation. Override requires notes; override rate is a health metric. `operator_score_composite` stays null pending 6–12 months of outcome data — **no invented weights anywhere in the UI.**
   - Capital gate (#12): lender underwrites; binary post-financing capture, not a scoring input.
   - Outcome metrics (#15): (1) signed AND funded (binary); (2) reorder velocity, with **capture-time machine-instrumentation tag per location** — unrecoverable if skipped. Both wired from deal one.
3. **Repo standing rules (CLAUDE.md):** $179,000 territory price non-negotiable Phase 1 · Box Sign only, no DocuSign at any phase · formula constants imported from `/lib/addressable-market-constants.ts`, never inlined · RLS on every table from creation · migrations timestamp-prefixed · Census cache in `territories.census_raw_data`, no re-fetch < 90 days · squash-merge only, feature branch + PR, no direct push to main · decisions → `ops.decision_log` with explicit `residual_risk`; handoffs → `/handoffs/`; Drive read-only.
4. **Stage semantics have one source of truth: `src/lib/pipeline-stages.ts`.** No component, migration, or document hardcodes stage integers; everything imports the named constants. This PRD documents that file; where they ever disagree, the file wins and the PRD gets a PR.
5. **Truth-gated messaging rule.** No automated outbound message may assert a fact the system cannot verify from data at send time (governs §8; kills unverified scarcity claims).
6. **All proposal market numbers render from `territories`** (formula v2 outputs). No grandfathering logic anywhere (#50).
7. **Insert contract:** all prospect creation goes through `src/lib/prospect-insert.ts` (integer stage, correct column names). No raw inserts from UI code.
8. **v1 users:** Trace (builder/operator) + Leif (independent Tier 2 and territory-report validation). Auth is two named users, simple; role architecture deferred to v2 (sales-force rollout).

---

## 1. Product Definition

> GHMD Territory Sales OS is a single-object pipeline. The object is the **Prospect** — one row, one licensee opportunity, moving through an 11-stage machine from New Lead to Implementation Handoff, with an orthogonal health status (active / stalled / lost). Every backend process — capture, transcription, scoring, triage, proposal generation, engagement tracking, Box embedded signing, outcome capture — is a side effect of pipeline position or a soft-gated transition, never a separate screen. The operator interacts with exactly three surfaces: the **Pipeline Board**, the **Deal Room**, and the public **Proposal Page**.

**Design doctrine:** Sales GPS, not database. Every screen answers: what happened, what matters, what do I do next — with exactly one recommended next action.
**Immediate goal:** a demonstrable, design-forward product (demo-grade with seeded data), evolving in place into the live system. Progress, not perfection — but trackable from deal one (#15 fields wired at close).

---

## 2. State Machine (conformed to pipeline-v2, PR #52)

### 2.1 The 11-stage machine (`prospects.stage`, source: `pipeline-stages.ts`)

| id | Stage | Notes / gates |
|---|---|---|
| 1 | New Lead | `FIRST_STAGE`; all inserts enter here via `prospect-insert.ts` |
| 2 | Contacted | |
| 3 | Discovery Call Scheduled | Recall.ai bot scheduled with the call |
| 4 | Discovery Call Met | transcript → extraction → Tier 2 queue populate here |
| 5 | Proposal Sent | **soft triage gate on 4→5** (new, §2.3) |
| 6 | Validation | reference calls + territory negotiation |
| 7 | Funding Pre-Qualified | lender confirms; sets `funding_prequal_cleared` (+`_at`/`_by`, webhook-ready for iLease/Ottri) |
| 8 | Contract Sent | **soft capital gate** (`FUNDING_PREQUAL_GATE_STAGE`, shipped) |
| 9 | Contract Signed | Box webhook |
| 10 | Funded / Won | **#15 capture point:** signed-and-funded binary + instrumentation tag (required fields at this transition) |
| 11 | Implementation Handoff Scheduled | `LAST_STAGE` |

### 2.2 Health overlay (`prospects.deal_status`)

`active | stalled | lost` — orthogonal to stage; a prospect can be stage 4 and stalled. Replaces v1.1's Nurture/Lost pseudo-stages entirely. `lost` requires a reason. Stall detection (v2): inactivity sweep proposes `stalled`; operator confirms.

### 2.3 Gate architecture (three kinds, deliberately different)

- **Soft capital gate (shipped, stage ≥ 8):** `requiresFundingPrequalConfirm()` prompts "advance anyway?"; skip sets `skipped_funding_prequal` → persistent amber **PRE-QUAL SKIPPED** badge on card + Deal Room header. Never blocks. Consistent with #12 (capture, not blocker).
- **Soft triage gate (new, 4→5, approved this session):** identical pattern and code shape — advancing to Proposal Sent without a completed triage prompts "triage not complete — advance anyway?"; skip sets a `skipped_triage` flag → amber **TRIAGE SKIPPED** badge. Rationale: converts every deviation from the scoring process into a logged, deliberate, visible act — protecting the uniformly-applied-criteria record (Jackson Walker) at the cost of one confirm click.
- **Hard confidence gates (locked #2, unchanged):** these gate **triage generation**, not stage movement — no triage recommendation exists until Tier 2 is complete and no scored field sits at low confidence. The UI cannot render a triage that the rules haven't produced. Soft gates govern *movement*; hard gates govern *judgment artifacts*. Never conflate.

### 2.4 `deals` demoted → Territory Agreement record (approved this session)

`deals` holds the transaction artifacts only: `proposal_url`, `box_sign_envelope_id`, `signed_at`, `territory_price` ($179,000), `territory_id`, go/no-go audit fields. 1:1 with a prospect's live opportunity, created at proposal generation. **`deals.stage` is DEPRECATED** — column comment added, no code reads or writes it, dropped in a future cleanup migration once M-suite lands. All lifecycle position lives on `prospects.stage`.

### 2.5 Board mapping

11 stages render as **6 grouped columns** (tunable): Leads (1–2) · Discovery (3–4) · Proposal (5–6) · Funding (7) · Contract (8–9) · Won (10–11). `deal_status` renders as overlay treatment (stalled = amber wash + flag; lost = filtered out by default), never as columns. Full 11-stage granularity visible inside the Deal Room stage pill and via board column expansion.

---

## 3. Surfaces & Screen Specifications

**Route strategy: modify in place — no `/demo/*` namespace.** The existing routes become the product: `/pipeline` → Pipeline Board · `/prospects/[id]` → Deal Room · `/proposals/[prospectId]` → Proposal Page. `/prospects`, `/prospects/new`, `/territories`, `/territories/[id]` are retained and restyled to tokens. Demo state comes from a **seed script** (one fictional practice per stage, one stalled, one triage-skipped, one pre-qual-skipped — so every badge and state renders), not from parallel surfaces.

### 3.1 Pipeline Board (`/pipeline`)

**Job:** open the app, know in 10 seconds what needs action today.

- **Metric strip (≤6):** New Leads · Discovery This Week · Proposals Live · Pre-Qualified · Contracts Out · Won This Quarter. Each is a filter, not a report.
- **Priority Action List (the real home page):** ranked ≤8 rows: prospect + data-derived reason + one action ("Viewed financing 3× in 48h → Call today"; "Triage pending 26h → Review now"; "Stalled 9 days at Validation → Re-engage"). Reasons generated from data, never free text.
- **Cards:** practice, prospect, territory, days-in-stage, triage chip (Proceed/Conditional/Pass or "—"), skip badges, engagement flame (stage ≥5), one CTA.
- Drag-and-drop allowed for ungated transitions; gated transitions open the confirm dialog (soft) — never silently move.
- One filter (status: active/stalled/lost, default active). One global search.

**Acceptance:** loads <1.5s at 60 prospects; every gated move produces either a completed action or a logged skip; any Deal Room one click away.

### 3.2 Deal Room (`/prospects/[id]`) — 3-Column Command Center

Desktop-first (single operator); stacks below 1280px.

**LEFT — Context (280px):** practice / prospect / specialty / territory + mini-map · **three-signal block, never blended:** triage chip (with Tier 1/Tier 2 status + SLA countdown), territory score (from formula engine), capital status (green cleared / amber skipped / gray pending) — each expandable to evidence · top 3 objections (confidence-badged, expandable to transcript span) · transcript link (opens center, collapsed).

**CENTER — Workspace, three tabs:**
1. **Action** — the current stage's workflow: triage confirm → proposal wizard → live Proposal Page preview (iframe) → embedded Box Sign → Won capture form (#15 binary + instrumentation tag, both required). One primary CTA per stage; gate confirms render here.
2. **Comms** — outbound drafter grounded in transcript + engagement data; nothing sends without operator click. (v1: manual send; automation is v2 per §8.)
3. **Calls** — recording player + word-timed searchable transcript + **Tier 2 Review Queue**: Tier 1 fields in four-column state; judgment-only fields (affect/energy, coachability, motivation authenticity, engagement, chemistry/fit) for human entry; low-confidence fields flagged red and blocking triage; overrides require notes; `reviewed_at/by` stamped; 24h SLA visible. Triage renders only after the hard gates clear. Adjacent: **Salesperson Scorecard** (`call_scores`, designated this session) — self-coaching view of the seller's own call performance, fully separate from operator scoring.

**RIGHT — Timeline & Engagement (320px):** engagement panel (stage ≥5): views, section dwell, CTA clicks, last-seen, plain-English summary line · chronological feed: activities, touches, stage changes + skip events, contract events.

**Header:** stage pill (full 11-stage), deal_status chip, triage chip, engagement label, one primary CTA, overflow menu.

**Acceptance:** state/signals/next-action visible without scrolling; transcript never default-open; contract status zero-navigation; every AI-derived claim clickable to evidence; skip badges impossible to miss.

### 3.3 Proposal Page (`/proposals/[prospectId]`, public)

Unguessable expiring token (30-day default, renewable), `noindex`, no auth wall; serves only what the buyer needs — no internal scores, no other territories. Sections: personalized executive summary → why this territory → market opportunity → protected territory map → GHMD clinical & business model → revenue opportunity → required investment ($179,000) → financing path (Avvance terms only) → launch plan → support included → proof/credibility → CTA → contract path. **All market numbers from `territories` via `/lib/addressable-market-constants.ts` imports.** Section-level view/dwell/CTA events → `engagement_events` webhook (token-validated, rate-limited) → Deal Room in near-real-time. At stage 8, terminal CTA becomes the Box embedded-sign entry. Brand bar: highest-stakes branded touchpoint — Lighthouse ≥90, sub-2s, flawless on iPad.

### 3.4 Proposal Wizard (inside Deal Room → Action)

Four steps, <3 minutes: confirm prospect/practice/territory (pre-filled) → confirm proposal type + pricing ($179K locked) → select proof points + AI-drafted personalized intro (from transcript; operator edits) → preview → publish (creates the Territory Agreement record + tokenized URL, advances 4→5 through the triage gate). Usability gate: call-met → proposal-sent in under 5 clicks of decision-making.

---

## 4. UX & Design System

### 4.1 Principles (enforced in review)
One recommended next action per screen · progressive disclosure (summary default, raw data one click deeper, nothing deleted) · AI explainable and editable — every score/label/draft links to evidence, overridable with attribution · visual status everywhere (stage pill, triage chip, skip badges, health overlay, engagement flame) · complexity lives in the API layer · premium, clinical, executive — low clutter, strong hierarchy, generous whitespace. Not a CRM grid, not a marketing dashboard.

### 4.2 Token architecture
`/src/design/tokens.ts` + Tailwind extension = single source for color, type, spacing, radius, elevation, motion. **Task 0 (blocker-class): the GHMD brand asset package lands in-repo as the token seed** — hex palette, web font stack/files, logo variants, icon style, photography direction, spacing rules. The navy/teal directions in the planning PDFs are explicitly NOT the target. Internal app uses the utilitarian end of the token scale; Proposal Page uses the expressive end (display type, photography). Coder leads UI work with the frontend-design skill + brand package.

### 4.3 Component library (build order)
Foundation: Button set · StagePill (11-stage aware) · TriageChip (+evidence popover) · SkipBadge (pre-qual / triage variants) · HealthChip · EngagementFlame · Card · Tabs · ConfirmDialog (soft-gate variant) · Toast · EmptyState. Composite: PipelineColumn (grouped) · ProspectCard · PriorityActionRow · MetricCard · TimelineFeed · TranscriptPlayer (audio-synced) · TierTwoReviewPanel · FourColumnField (value/source/confidence/notes renderer) · ObjectionChip · EngagementPanel · ProposalSectionEditor · BoxSignFrame · WonCaptureForm. Storybook required; every component demonstrates default/hover/focus/loading/empty/error before integration.

### 4.4 Interaction standards
Skeletons not spinners; optimistic UI only on ungated actions · designed empty states with one action · errors inline, specific, recoverable; soft-gate dialogs state exactly what's incomplete and what skipping records · full keyboard nav, visible focus · WCAG 2.1 AA, reduced motion respected · desktop-first; Proposal Page mobile/tablet-flawless.

### 4.5 Terminology (UI copy)
Prospect · Practice · Territory Opportunity · Call Intelligence · **Fit: Proceed / Conditional / Pass** (never a composite number) · Discovery Recording/Transcript · Custom Territory Proposal · Buyer Engagement · Territory Agreement · **Won / Funded** (stage 10 label) · health: Active / Stalled / Lost · **Next Best Action**.

---

## 5. Data Model — Migrations (in order)

**M0 — Baseline capture (P0.5, approved this session):** schema-only dump of the untracked base DDL (`prospects`, `deals`, `territories`, plus any other out-of-band objects) into a timestamped baseline migration with a header documenting provenance. Closes the drift flag declared in `20260703120000`'s own header. One hour now vs. production surgery later; unblocks branch databases and repo-only reconstruction.

**M0.5 — Designations:** column comment deprecating `deals.stage`; table comment designating `call_scores` as the **Salesperson Scorecard** (seller-side of bilateral scoring; operator tables score the buyer).

**M1 — `transcripts`:** id, prospect_id, recall_bot_id, recording_ref, transcript_text, transcript_segments jsonb (word timings), assemblyai_transcript_id, language, duration_seconds, pipeline_status, created_at. Delivery: Recall.ai webhook → Edge Function → insert → extraction trigger. Manual upload = admin fallback only.

**M2 — `call_intelligence`** (buyer-facing deal intelligence, keyed `prospect_id` via transcript): summary, buying_signals, objections (with span refs), decision_process, financial_readiness, missing_questions, recommended_next_step — every extracted field in the four-column pattern with the five-type source enum, + reviewed_at/by, model_version, prompt_version. **Boundary:** operator scoring stays in `operator_scores`/`operator_score_records` per the taxonomy schema; one extraction pass writes both destinations; M2 never duplicates Group B–F fields.

**M3 — `engagement_events`** (keyed `prospect_id`, agreement ref nullable): event_type (page_view/section_view/section_dwell/cta_click/contract_view/download/return_visit/email_open/email_reply/sms_reply), section_key, dwell_seconds, occurred_at, session_id, meta. Written by the Proposal Page webhook.

**M4 — sequences suite (v2, deferred):** `sequences` / `sequence_steps` / `sequence_enrollments` — typed jsonb trigger conditions, draft-and-notify mode, every fired step writes `outreach_touches` with `trip_wire_fired = true`.

**M5 — `contract_events`** (keyed to the Territory Agreement record): status enum (draft_generated → internal_approval → sent → viewed → signed_buyer → countersigned → executed → stored), actor, box_event_id, occurred_at. Box webhooks populate; `deals.signed_at` set on executed.

**M6 — Won capture (#15):** `signed_and_funded` boolean + `machine_instrumented` tag on the appropriate record (location/territory level per #15), both **required** at the stage 9→10 transition. Plus `skipped_triage` flag on `prospects` (mirrors `skipped_funding_prequal`).

All RLS-enabled from creation; service-role write paths; `Supabase:get_advisors (security)` after each lands.

---

## 6. Call Intelligence Pipeline (locked stack)

Recall.ai bot "GHMD Call Notes" joins (notification at open per #14) → AssemblyAI Universal-3 Pro + Medical Mode (native single-parameter integration) → transcript-ready webhook → Edge Function → `transcripts` → Claude extraction (new Anthropic key) writes Tier 1 to `operator_scores` (taxonomy Groups B/C) and buyer intelligence to `call_intelligence` → Tier 2 Review Queue populates in the Deal Room (Leif, ≤24h) → hard gates clear → triage renders. **Stage movement stays a human action** — pipeline completion readies the workspace; it never advances `prospects.stage`.

Layer 1 pre-call enrichment (verifiable behavioral residue → `operator_enrichment`, Group A, non-scoring wall enforced) precedes every call. No summary layer; verbatim transcript is the source of truth. Every AI output carries model_version + prompt_version; extraction prompts live in-repo and pass the Second-Opinion Gate. **Calibration gate before live use:** run extraction on 5–10 historical transcripts; Trace + Leif validate pre-scores and objection extraction first.

---

## 7. Integrations

Box Sign (only — no DocuSign): embedded signing in Deal Room Action tab + Proposal Page terminal CTA; webhooks → `contract_events`; executed file auto-stored Box / Contracts / Territory Agreements / {territory}; internal approval precedes send. **Feasibility spike is the first task of the v1 phase** — one hour against Box docs + sandbox envelope before anything load-bearing. · Lead intake: site form → Edge/Netlify function → `prospect-insert.ts` path (stage 1). · Scheduling: Calendly webhook → stage 3 + activity row + bot scheduling. · Lender: `funding_prequal_cleared_at/_by` designed for future iLease/Ottri webhook; manual until then. · Territory data: read-only from `territories` / formula engine. · Email/SMS: v1 manual via Comms tab; engine decision (in-app M4 vs GHL vs hybrid) deferred to v2.

---

## 8. Follow-Up Automation (v2 scope, spec fixed now)

Behavior-triggered, objection-keyed, subject to the truth-gated messaging rule and: draft-and-notify only for the first 60 days · triggers fire only on high-confidence or human-confirmed objections · max 1 automated touch / 48h / prospect · any inbound reply pauses the sequence · day-7 stall escalates to a mandatory human task, never another email · the adjacent-territory scarcity message can only fire when the system verifies a real active deal or `reserved_for` on a bordering territory at send time — otherwise the rule cannot fire. Trigger table carried unchanged from v1.1 §8.

---

## 9. Security, Compliance & Retention

1. Proposal Page: tokenized expiring URLs, `noindex`, rate-limited signed webhooks, no internal data in payloads.
2. Keys: Recall.ai / AssemblyAI / Anthropic scoped to this platform; Netlify env; redeploy after set; rotation noted in `ops.decision_log`; spend caps/alerts per Open Item #20 architecture.
3. Recording: notification at the open of every call (standing rule per #14, ByrdAdatto-cleared; method-independent, covers bot and SDK fallback).
4. Transcripts = confidential business-financial statements: private bucket, signed URLs, no transcript text in client logs/analytics.
5. All gate logic server-side (SECURITY DEFINER RPC pattern); soft gates record skips server-side; hard gates cannot be bypassed by the UI.
6. **Retention framework (DRAFT — for Rick's review; issue-spotting, not legal advice):** retain for every evaluated operator, declined included: audio, verbatim transcript, all `operator_scores` rows incl. overrides + notes, triage record. Window: life of any executed relationship + [5 years — placeholder, Rick sets against limitations periods] for declined operators. Purges policy-driven, uniform, logged — never selective (selective deletion destroys the uniformity the records exist to prove). Litigation hold suspends all deletion. **Notes discipline:** observations tied to criteria and verbatim quotes only; no characterizations or speculation about persons. Access: service-role + named reviewers; exports logged.
7. **Legal review checkpoint (one-time, before the first real prospect touches the system — not a demo blocker):** Rick reviews (a) proposal content template — claims, ROI framing, territory-protection language (CLAIMS_MATRIX governs clinical/ROI claims); (b) message template library; (c) proposal-to-signature sequence incl. Box flow; (d) the retention framework above. Licensee-channel FDD clearance does not cover misrepresentation or claims-substantiation exposure.

---

## 10. Decisions

**Decided this session (Trace-approved, to be logged):**
- **A** — `deals` demoted to Territory Agreement record; `deals.stage` deprecated. Rationale: eliminates the dual-state-machine drift channel while tables are empty.
- **B** — Soft triage gate at 4→5, reusing the shipped soft-gate pattern (`skipped_triage` flag + badge). Rationale: every deviation from the scoring process becomes a logged, deliberate act — protects the uniformly-applied-criteria record.
- **C** — Sequential-sprint rule RETIRED (pipeline-v2 merge noted as precipitating exception). Replaced by the **reconciliation precondition:** no new sprint opens until SPRINT-STATE, the current handoff, and the decision-log mirror reflect main HEAD. Plus standing **session-boot rule:** any Chat session touching architecture opens by pulling `ops.decision_log` and `/handoffs/LATEST.md`.
- **D** — `call_scores` designated the Salesperson Scorecard (seller side of bilateral scoring).
- **E** — Route strategy: modify in place; no `/demo/*` namespace; demo state via seed script.

**Open (none block the demo):** proposal token TTL 30-day default (confirm) · internal approval / countersign owner for contract send (Bruce? Trace?) — drives M5 · sequencing engine in-app vs GHL vs hybrid (v2) · Box Sign spike (scheduled first task of v1 phase) · retention window number (Rick).

---

## 11. Phasing

**P-1 — Reconciliation commit (first commit, precedes everything):** `npm run log:export` (mirror ~2 entries stale) · fix SPRINT-STATE's "decision #49" → #50 reference · update SPRINT-STATE + fresh handoff superseding v2.24 to reflect main `306fdbd` reality (formula-v2/pipeline-v2 shipped) · declare the demo sprint · log decisions A–E + PRD adoption.
**P0 — Brand tokens:** asset package → `tokens.ts` + Tailwind config → Storybook foundation components.
**P0.5 — M0 baseline migration** (+ M0.5 designations).
**P1 — DEMO (the "looks good to show" milestone):** three surfaces restyled/rebuilt in place on seeded data — board with grouped columns + priority list, Deal Room shell with three-signal block + timeline, Proposal Page at brand quality. Seed covers every stage, one stalled, one of each skip badge. No live pipeline, no Box, no automation. Exit: Trace would show it to anyone.
**P2 — MVP (live capture):** M1 + M2, Recall/AssemblyAI wiring, extraction, Tier 2 queue live, calibration gate passed, soft triage gate active, salesperson scorecard.
**P3 — v1 (deal-close path):** Box spike → embedded signing + M5 + internal approval → M3 engagement ingestion + wizard publish flow → M6 Won capture (#15 fields) → retention posture applied. Exit: a real deal can run end-to-end and is trackable from deal one.
**P4 — v2 (leverage):** automation (M4, draft-and-notify) · sequencing-engine decision · stall detection · multi-user auth/roles for sales-force rollout.
Each phase closes with: Second-Opinion Gate, security-advisors sweep, decision-log entry.

---

## 12. Coder Handoff Notes

Rule 0 (`git remote -v` = ghmd-sales-platform) before anything; NIP never open simultaneously. · Read the frontend-design skill + brand package before any UI work; planning-PDF mockups are explicitly not the design target. · Stage constants only via `pipeline-stages.ts` imports; formula constants only via `/lib/addressable-market-constants.ts`; prospect creation only via `prospect-insert.ts`. · Frontend reads state, never computes it; all gates and skip-recording server-side. · Modify routes in place; seed script provides demo state. · Storybook states are acceptance criteria. · Squash-merge, feature branches, every phase decision-logged with explicit `residual_risk`.

*Ground truth reconciled against: repo main `306fdbd` (PRs #50–55), `src/lib/pipeline-stages.ts`, migration `20260703120000`, `scripts/seed_capture_taxonomy.sql`, migration `20260629000000`, live Supabase schema (project `cprltmwwldbxcsunsafl`), `ops.decision_log` rows 1–50, CLAUDE.md standing rules, Track B session records (2026-06-26/28).*
