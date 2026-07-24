# Unresolved Questions & Approval Gates

**Context:** [DECISION: #141] territory-data discovery, 2026-07-24. These are **commercial and
scoping decisions that are Trace's to make** — recorded here rather than resolved by assumption, per
the brief and [REPO: docs/AGENTS.md] (Coder does not make product decisions).

---

## A. Commercial-semantics questions for Trace (do not assume)

| # | Question | Why it can't be assumed | Blocks |
|---|---|---|---|
| Q1 | For a legacy sold territory, what is the **legally controlling boundary** — the ArcGIS polygon as drawn, or a contract/exhibit map? If they differ, which governs? | Determines what geometry is imported as the frozen `sold_boundary_geom`. Guessing risks importing a shape that doesn't match the contract. [REPO: TERRITORY-METHODOLOGY.md §8.4] | Import geometry source |
| Q2 | How should **provisional / pipeline / negotiation-redraw / abandoned** map onto the platform's status model (`available / draft / sold`)? Is a "provisional hold" a sold right or not? | These are not first-class DB states today; CRM-003 defers redraw + versioning. A wrong mapping over- or under-states real commercial rights. [REPO: GHMD-CRM-003.md] | Status normalization |
| Q3 | If any **already-sold legacy territories overlap** in ArcGIS, how are they resolved? (Grandfathering is retired — decision #49 — so there is no freeze-legacy rule to fall back on.) | Overlaps between contracted territories are a legal/commercial matter, not data-cleaning. [REPO: docs/AGENTS.md decision #49] | Overlap handling / counsel |
| Q4 | For **duplicate and abandoned sketches** in ArcGIS: discard rule? (Keep newest by date? Keep only features with a sold date + licensee?) | #141 names dedupe as a cleanup step but not the rule. Wrong rule imports junk or drops a real territory. [DECISION: #141] | Cleanup filter |
| Q5 | What is the **stable identity key** linking an ArcGIS feature to a future DB territory and to the licensee/contract? (CRM-003 proposes `territory_family_id`.) | No cross-source key exists today; without one, features can't be matched or re-matched after versioning. [REPO: GHMD-CRM-003.md] | Attribute mapping |
| Q6 | Is there a **CRM export** (AesthetiX/GHL) that carries territory identity, sold date, or licensee linkage worth reconciling against ArcGIS? | Not located in-repo this session (F6). May or may not exist. | Attribute enrichment |

---

## B. Access / evidence gates (must clear before a validation pass can even run)

| # | Gate | Owner | Status |
|---|---|---|---|
| G1 | Read-only **ArcGIS export or Feature Service** access provided to the working environment | Trace / Chat | **Open** — not available this session (F5) |
| G2 | Trace's **ArcGIS data-cleanup pass** complete (dedupe, consistent name+date, valid geometry, overlaps resolved, consistent schema) | Trace | **Open** — explicit precondition of #141 |
| G3 | Source **SRID / geometry type** confirmed on the ArcGIS layer | Trace / Coder (on export) | **Open** — unknown (F10) |

---

## C. Approval gates before ANY write / import (governance)

| # | Gate | Basis |
|---|---|---|
| AG1 | A **separate, approved implementation brief with acceptance criteria** — import is explicitly out of scope for the discovery brief | [HANDOFF: LATEST.md v2.62 §8, §12] |
| AG2 | Answers to Q1–Q5 recorded as decisions **before** the import brief is scoped | This document |
| AG3 | **`ultrareview` tier + Second-Opinion Gate** on the import PR (auth/RLS, data migration, money-adjacent) | [REPO: docs/AGENTS.md Review SOP] |
| AG4 | **Pre-load Supabase backup** timestamp confirmed; batch-tagged staged load; verbatim sold geometry; rollback = delete-batch/restore | RECONCILIATION-REPORT.md §5 |
| AG5 | **`ops.decision_log` entry authored by Chat** at phase close (Coder reports content + SHA only) | [REPO: AGENTS.md Rules 18, 14] |
| AG6 | Any real legacy **overlap or contract-vs-map conflict escalated to Trace/counsel** — never auto-resolved | Q1, Q3 |

---

## D. Provisional items in the executive artifacts that need validation before reliance

- v3 sizing **1.5× viability buffer** and the **0.5% "Conservative" penetration anchor** (62 × 1.5 = 93 → ÷ 0.005 = 18,600 qualified-HH floor) — starting values, not empirically validated. Distinct from the separate **1% "Base" proposal scenario**. [REPO: lib/addressable-market-constants.ts]; [REPO: src/lib/__tests__/v3-constants.test.ts] `[PROVISIONAL]`
- Proposal **revenue/scenario figures** — revenue `scenario_outputs` have no formula-v2 producer and are seeded illustrative-only (decision #71, `legal_flag: true`). [REPO: docs/TERRITORY-METHODOLOGY.md §7]; [REPO: src/app/p/[slug]/page.tsx] `[PROVISIONAL]`
- Any **prospect/salesperson scoring weights or rubrics** shown — require approval before use. [HANDOFF: LATEST.md v2.62 §10.3] `[PROVISIONAL]`
- "**80+**" legacy sold-territory count — reported figure, not independently counted this session. [DECISION: #141] `[PROVISIONAL]`
- ArcGIS **SRID, validity, overlaps, duplicates** — all unknown until access (Section B). `[PROVISIONAL]`
