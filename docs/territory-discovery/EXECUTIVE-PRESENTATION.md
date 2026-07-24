# GetHairMD Sales Platform — Executive Briefing

**Territory data, the map, the gates, and how AI assists (without deciding)**

Prepared 2026-07-24 · Audience: Executive (non-technical) · Companion: SYSTEM-MAP.md

> **How to read this deck.** Every capability carries a **status label** and a **source tag** so you
> can tell what is real today from what is planned. Anything not yet operational is marked
> **`[PROVISIONAL: validation needed]`** — its appearance here is **not** approval, deployment,
> validation, or authority to build it. Full evidence: SOURCE-REGISTER.md.

**Status labels used throughout:**
`Live` · `Built, unvalidated` · `In development` · `Approved future design` · `Concept requiring approval` · `Human only`

---

## Slide 1 — The one thing to know about territory data today

- The sales platform's database currently holds **demo/practice territory data only** — **no real
  contracted territories are in it yet.** `Live (but demo data)` [DB: public.territories/2026-07-24]
- Your **80+ real, already-sold territories live in ArcGIS** (the mapping tool used before this
  platform). They have **not** been moved in yet — on purpose. `Approved future design` [DECISION: #141]
- Moving them in is a deliberate, gated project (decision #141). This briefing is the **read-only
  discovery** that precedes it — **nothing was imported, changed, or recalculated.**

**Why it matters:** the national map you can click today is a **demonstration**, not the real
network footprint. We will not present it as reality until the real territories are imported. [DB: F13]

---

## Slide 2 — Where territory numbers come from (the governing equations)

Two methods exist. Both are corporate-only math; **salespeople see outputs, never formulas.** [REPO: docs/AGENTS.md]

**A. Addressable-market formula (v2) — `Built, unvalidated`** [REPO: lib/addressable-market-constants.ts]
> Households in an area **×** the share that can afford it (income, from the U.S. Census) **×** the
> share that can finance it (credit quality, from Experian). No "how common is hair loss" guess — it
> was deliberately removed. [REPO: docs/AGENTS.md Locked Technical Facts]
> *(Label note: the formula and its constants are documented and locked, but no dated evidence was
> gathered this session that the in-app producer runs against live data — the three anchor numbers in
> the database were seeded, not computed live. Hence `Built, unvalidated`, not `Live`.)*

**B. Drive-time territory sizing (v3) — `Built, unvalidated`** [REPO: docs/TERRITORY-METHODOLOGY.md §8]
> Instead of a radius, draw the real **drive-time area** around a practice and grow it (5 to 45
> minutes) until it contains enough qualified households to be viable, then stop.
> **Provisional inputs, clearly flagged:** the v3 viability floor is anchored at the **0.5%
> "Conservative" penetration rate** — 62 needed customers **× 1.5** buffer = **93** minimum viable
> customers, **÷ 0.005 = 18,600** qualified households the drive-time area must contain. Both the
> **1.5× buffer** and the **0.5% anchor** are **starting values confirmed by Trace, not yet proven by
> real sales**, and carry explicit recalibration triggers.
> *(Do not confuse this with the separate **1% "Base" proposal scenario** — a different, documented
> placeholder shown with 0.5%/2% sensitivity on proposals; it is not the sizing floor.)*
> `[PROVISIONAL: validation needed]` [REPO: lib/addressable-market-constants.ts]; [REPO: src/lib/__tests__/v3-constants.test.ts]

**Reality check:** **no territory has actually been sized by the v3 engine in production yet** — zero
v3 rows exist in the database. [DB: 0 formula_version=3 rows/2026-07-24]

---

## Slide 3 — Who does what (the data & map providers)

| Provider | What it is responsible for | Status |
|---|---|---|
| **Supabase / PostGIS** | The platform's own database — the future **authoritative store** of territory shapes, overlaps, and status | `Live` infra (PostGIS 3.3.7, dated catalog check); `Approved future design` as the territory system of record [DB: pg_extension/2026-07-24]; [REPO: docs/GHMD-CRM-003.md A.5] |
| **Mapbox** | Drawing and displaying maps; computing drive-time areas; the future negotiation-editing surface | `Built, unvalidated` (display/drive-time — token provisioned, live operation not verified this session); `Approved future design` (editing) [REPO: AGENTS.md (Environment Variables: `NEXT_PUBLIC_MAPBOX_TOKEN`)]; [REPO: docs/GHMD-CRM-003.md A.5] |
| **U.S. Census (ACS)** | Household **income** data feeding affordability | `Live` — a Production Census-backed request was verified [HANDOFF: LATEST.md v2.62 §4.2]; [REPO: AGENTS.md (Environment Variables: `CENSUS_API_KEY`)] |
| **Credit-quality data (Experian)** | Share of households that can **finance**, by state | `Built, unvalidated` (data present in repo; live consumption not verified) [REPO: data/sources/GHMD_State_Analysis_Data_Dump.csv]; [REPO: lib/addressable-market-constants.ts] |
| **ArcGIS** | The legacy home of the **real** sold territories; becomes a **read-only comparison/fallback** during transition, then retires | `Approved future design` (transition) [REPO: docs/GHMD-CRM-003.md A.5] |

---

## Slide 4 — Sold boundaries are contracts, not sketches

- When a territory is sold, its boundary becomes a **contracted commercial right.** The platform
  freezes it: the sold shape is **written once and never recalculated.** `Live` (freeze trigger
  `territories_sold_boundary_guard` confirmed **applied and enabled** by dated catalog check —
  though it guards **0 rows today**, since no sold boundary is set yet)
  [DB: pg_trigger on public.territories/2026-07-24]; [REPO: supabase/migrations/20260710140000_governed_row_write_guards.sql]
- **We will not re-run the current formula on an already-sold territory.** The new drive-time math
  would produce a *different* shape — and changing a sold shape changes a contract. The import loads
  each real sold boundary **exactly as drawn.** [REPO: docs/TERRITORY-METHODOLOGY.md §8.4] [HANDOFF: LATEST.md v2.62 §12]
- **Overlaps between two new territories:** the **earlier-sold territory wins**; the later one stops
  at that boundary. `Built, unvalidated` (rule defined; never exercised — 0 v3 territories exist)
  [REPO: docs/TERRITORY-METHODOLOGY.md §8.4]; [DB: 0 formula_version=3 rows/2026-07-24]
- **Overlaps between two already-sold legacy territories** (if any exist in ArcGIS): **not** an
  automatic fix — a **Human-only** commercial/legal decision. `Human only` [REPO: docs/AGENTS.md decision #49]

---

## Slide 5 — Negotiation redraws & keeping the National Map current

- **Negotiation redraw** (adjusting a boundary during a deal): the rules for this are an
  **approved future design**, not built yet — they live in the Phase 1 "Territory Versioning" work,
  which is a hard prerequisite before any live contract editing. `Approved future design` [REPO: docs/GHMD-CRM-003.md]
- **National Network Map updates:** today the map reflects whatever is in the database (currently
  demo). Once real territories are imported and versioning ships, the map updates from the same
  single source of truth. `Built, unvalidated` (map route exists in code; live render not verified
  this session) / `Approved future design` (real-data + versioned updates)
  [REPO: src/app/(app)/national-map/page.tsx] [DB: F13]

---

## Slide 6 — The gates a deal passes through (humans decide)

| Gate | What it checks | Status | Who decides |
|---|---|---|---|
| **Qualification gate** | Is this prospect genuinely a fit before we invest time? | `Built, unvalidated` [REPO: supabase/migrations/20260709120000_qualification_gate_schema_rls.sql] | **Human only** |
| **Proposal gate** | Produce the prospect-facing proposal; enforce that **no viability math leaks** to the prospect | `Built, unvalidated` (revenue figures illustrative-only today) [REPO: supabase/migrations/20260705003707_proposal_system_p1.sql] `[PROVISIONAL]` | **Human only** |
| **Territory price** | $179,000 standard, non-negotiable in Phase 1 | `Live` **policy** — $179,000 is the in-force standard [REPO: AGENTS.md (Key Reference Values)]. Separately, the `deals.territory_price` schema **default** exists in repository implementation but is `Built, unvalidated` — no dated live catalog query this session confirms that default is applied in `cprltmwwldbxcsunsafl` [REPO: supabase/migrations/20260625020853_sprint1_foundation.sql] | **Human only** to change |

---

## Slide 7 — The meeting workspace (Zoom, script, questions, consent) — *planned*

Everything on this slide is **`Approved future design` (Phase 3)** — designed and sequenced, **not
built.** [REPO: docs/GHMD-CRM-003.md Phase 3]

- Join the **Zoom** meeting from inside the deal.
- A **script panel** with the **required discovery questions** beside the call.
- **Consent** captured before any recording; **transcript** captured as evidence tied to the deal.

> No Zoom/script/transcript feature exists in the product today. `[PROVISIONAL: validation needed]`
> (No such code found in the application this session.)

---

## Slide 8 — Two different scorecards: the prospect vs. the salesperson

These are **separate** on purpose and must never be conflated.

- **Prospect evaluation** — "is this a good deal?" A basic prospect fit score exists today
  (`icp_score`). `Built` for the simple score; **AI-based** prospect scoring is `Approved future
  design` (Phase 4). [DB: prospects.icp_score] [REPO: docs/GHMD-CRM-003.md Phase 4]
- **Salesperson evaluation** — "how is the rep performing/coaching needs?" Call-quality scoring
  (transcribe + AI score) is a **`Concept requiring approval`** — the data table exists but the
  scoring engine is not built, and **compensation, discipline, and coaching remain Human-only.**
  [REPO: supabase/migrations/20260625020853_sprint1_foundation.sql (`call_scores` table)] [HANDOFF: LATEST.md v2.62 §10.1, §10.3]

> Scoring **weights and rubrics are provisional** wherever they appear and require approval before
> use. `[PROVISIONAL: validation needed]`

---

## Slide 9 — How AI will assist (Phase 4) — and its hard limits

**Planned AI assistance — `Approved future design` (Phase 4):** [REPO: docs/GHMD-CRM-003.md Phase 4]
- Evidence-backed **summaries** of communications (incl. **Outlook**-derived email summaries — Phase 3 sync). [REPO: docs/GHMD-CRM-003.md §12.1]
- **Missing-information detection** and **stalled-deal alerts** (a simple rule-based stalled signal
  exists in code today — `Built, unvalidated`; live operation not verified this session).
  [REPO: src/lib/dashboard/triggers.ts]
- **Recommended next steps** and **low-risk, controlled automation** (e.g., drafting a follow-up for
  a human to send). `Approved future design` [REPO: docs/GHMD-CRM-003.md Phase 3–4]

**AI does not decide anything consequential. `Human only`:** [REPO: docs/GHMD-CRM-003.md §11] [HANDOFF: LATEST.md v2.62 §10.3]
> Qualification · territory rights · pricing · contracting · funding · loss / not-ready status ·
> compensation · discipline · legal · access control. **AI may summarize, surface, and suggest;
> a human authorizes.**

**Trust & audit rails the AI must run on (Phase 4 exit gate):** permission-safe retrieval (AI sees
only what the user may see), **source citations**, a **confidence** indicator, the **model/rubric
version** on record, **reviewer edits and override reasons** captured, and a full **audit history.**
`Approved future design` [REPO: docs/GHMD-CRM-003.md Phase 4 exit gate, §11]

---

## Slide 10 — What is real today vs. planned (one-glance summary)

**Live today** *(each backed by dated live evidence, not merely "code exists")*
- Territory price $179,000 (in force); U.S. Census request path (Production request verified,
  [HANDOFF: v2.62 §4.2]); PostGIS 3.3.7 infrastructure (dated catalog check); the sold-boundary and
  qa-lock freeze triggers (applied & enabled per dated catalog check — guarding 0 rows today).
  [DB: 2026-07-24]

**Built but not yet validated** *(implementation exists; live operation not verified this session)*
- Addressable formula v2 (in-app producer); v3 drive-time sizing engine (never run in production —
  0 rows); National Map rendering; qualification gate; proposal system (revenue figures
  illustrative-only, [REPO: docs/TERRITORY-METHODOLOGY.md §7]); rule-based stalled-deal signal;
  Mapbox display/drive-time; credit-quality data consumption. `[PROVISIONAL]`

**Approved future design (designed, not built)**
- Real ArcGIS territory import (#141); territory versioning & negotiation redraw; Zoom/script/
  transcript workspace; Outlook summaries; Phase 4 AI assistance with citations/confidence/audit.

**Human only — always**
- Qualification, territory rights, pricing, contracting, funding, loss status, compensation,
  discipline, legal, access control.

---

## Slide 11 — The single most important guardrail

> **Sold territory boundaries are contracts. The platform never recalculates them.**
> They are imported exactly as drawn, frozen, and changed only by a Human-authorized process.
> Everything AI does is assistive and auditable; every consequential decision stays with a person.

*Open commercial questions that must be answered by Trace before any real import — see
UNRESOLVED-QUESTIONS.md.*
