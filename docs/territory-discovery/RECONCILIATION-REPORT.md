# Territory Data Discovery & Reconciliation Report

**Decision:** [DECISION: #141] — Legacy sold-territory ArcGIS import (`OPEN / accepted`)
**Workstream:** Read-only discovery and reconciliation only (no import, no geometry change, no writes)
**Prepared by:** Coder session, 2026-07-24
**Supabase project confirmed:** `cprltmwwldbxcsunsafl` (ghmd-sales-platform) — verified via `list_projects` before any read [DB: list_projects/2026-07-24]
**Governing sources read:** [REPO: AGENTS.md] (root, current authoritative governance), [REPO: docs/AGENTS.md] (role definitions / Locked Technical Facts), [HANDOFF: LATEST.md v2.62 §8], [REPO: docs/TERRITORY-METHODOLOGY.md §8], [REPO: docs/GHMD-CRM-003.md A.5], [REPO: lib/addressable-market-constants.ts]
**Note on sessions:** original discovery 2026-07-24; a bounded correction pass (same date) revised source tags, lifecycle labels, and added a governed-row-guard catalog check. See EXECUTION-REPORT.md §1A.

> **Scope guard.** This report is discovery and reconciliation only. Nothing here imports, redraws,
> resizes, clips, normalizes, overwrites, or recalculates any territory geometry. No `ops.decision_log`
> write was made. The NIP project (`kjweckggegifjmmqccul`) was never queried. See EXECUTION-REPORT.md
> for the full no-writes attestation.

---

## 0. Bottom line

- The live Supabase `territories` table contains **only demo / QA-fixture data** — 67 rows, **zero
  with any geometry**, **zero real contracted sold boundaries**. [DB: public.territories/2026-07-24]
- The **21 rows marked `status='sold'` are demo seed rows** (all `Demo — <City, ST>`, point-center
  only, no polygon). They do **not** represent contracted commercial rights. [DB: public.territories/2026-07-24]
- The authoritative **80+ legacy sold territories exist only in ArcGIS Online and were never imported**
  into this database. [HANDOFF: v2.41 §1–2] [DECISION: #141]
- **The ArcGIS source could not be inspected this session** — no ArcGIS connector, credential, or
  tracked export is available to this environment. All ArcGIS-side geometry-quality findings
  (duplicates, abandoned sketches, self-intersection, overlaps, SRID) are therefore **`Unknown` and
  require access.** [PROVISIONAL: validation needed]
- **Sold boundaries are legally/commercially fixed and must never be recalculated** with the current
  v3 sizing formula. The schema already encodes this: `sold_boundary_geom` is written once at close
  and never recomputed. [REPO: supabase/migrations/20260706120000_v3_drive_time_boundary.sql]
  [REPO: docs/TERRITORY-METHODOLOGY.md §8.4]

---

## 1. Sources located, unavailable, or requiring access

| # | Source | State | Evidence |
|---|--------|-------|----------|
| S1 | Live Supabase `territories` + related tables | **Located, inspected (read-only)** | [DB: public.territories/2026-07-24] |
| S2 | Repository documentation & implementation (methodology, formula, migrations, National Map) | **Located, inspected** | [REPO: docs/TERRITORY-METHODOLOGY.md], [REPO: lib/addressable-market-constants.ts], [REPO: supabase/migrations/] |
| S3 | ArcGIS Online exports / Feature Service data | **Unavailable — requires access** | No connector/credential/export reachable this session; existence asserted by [DECISION: #141] |
| S4 | Prior CRM exports (AesthetiX / GHL stopgap) | **Unavailable — requires access** | No export tracked in repo (`git ls-files` scan); AesthetiX/GHL named as pipeline-tracking stopgap only [REPO: AGENTS.md (Stack: CRM stopgap)] |
| S5 | National Network Map requirements/expectations | **Located, inspected** | [REPO: src/app/(app)/national-map/page.tsx], [REPO: src/components/NationalStatusMap.tsx], [REPO: src/lib/__tests__/national-status-map.test.ts] |
| S6 | Credit-quality / county / state analysis data (formula inputs, not boundaries) | **Located** | [REPO: data/sources/GHMD_State_Analysis_Data_Dump.csv], [REPO: data/sources/ghmd_county_analysis_PTI8.csv], [REPO: data/sources/ghmd_county_analysis_PTI5.csv] |

---

## 2. Record counts and relevant fields (where safely observable)

All counts below are **read-only** from project `cprltmwwldbxcsunsafl` on 2026-07-24. [DB: public.territories/2026-07-24]

### 2.1 `public.territories` — 67 rows

| Dimension | Value |
|---|---|
| Total rows | 67 |
| `status='available'` | 45 |
| `status='sold'` | 21 |
| `status='draft'` | 1 |
| `status='reserved'` / other / NULL | 0 |
| `formula_version = 2` (v2 ZCTA) | 67 (**all**) |
| `formula_version = 3` (v3 drive-time) | 0 |
| Rows with `boundary_geom` | **0** |
| Rows with `sold_boundary_geom` | **0** |
| Rows with `addressable_patients_primary` | 3 |

Name classification [DB: public.territories/2026-07-24]:

| Class | Count | `qa_locked` |
|---|---|---|
| `Demo — <City, ST>` seed rows | 63 | 0 |
| QA anchors (`Austin – Westlake`, `Dallas – Preston Hollow`, `Nashville – Green Hills`) | 3 | 3 |
| QA fixture (`QA114 — Cherry Creek Denver`, draft) | 1 | 0 |
| **Any real / non-fixture row** | **0** | — |

The three qa_locked anchors carry the only addressable numbers present: Austin–Westlake 5,483;
Dallas–Preston Hollow 7,204; Nashville–Green Hills 4,127 — all `formula_version=2`, all point-center
+ drive-time-minutes, **no polygon**. [DB: public.territories/2026-07-24]

### 2.2 Related territory tables

| Table | Rows | Note |
|---|---|---|
| `territory_sizing_jobs` | 15 | v3 sizing job records (QA anchor re-runs + QA114) [DB: 2026-07-24] |
| `territory_scouting_reports` | 3 | Exec-only scouting fixtures [DB: 2026-07-24] |
| `deals` (all / with `territory_id`) | 28 / 28 | Demo deals linking demo prospects → demo territories [DB: 2026-07-24] |
| Duplicate territory names | none | `group by name having count(*)>1` returned empty [DB: 2026-07-24] |

---

## 3. Findings (each: Status · Source · Observation · Confidence · Significance · Next action)

### F1 — Live DB territory data is 100% demo/QA fixture
- **Status:** Verified
- **Source:** [DB: public.territories/2026-07-24]
- **Observation:** 67/67 rows are `Demo —` (63), qa_locked anchors (3), or a QA draft (1). Zero
  non-fixture rows. Zero rows have geometry. All `formula_version=2`.
- **Confidence:** High (full-table census, three converging signals: name prefix, NULL geometry, seed provenance).
- **Significance:** There is **no real territory data of record** in the Sales Platform database today.
  The National Status Map, deal→territory links, and sizing jobs all render/reference fixtures.
- **Next action:** Treat the DB as an empty slate for real territories; the import target is a
  greenfield population, not a merge against real rows.

### F2 — 21 `sold` rows are demo, not contracted rights (status-vs-reality conflict)
- **Status:** Conflicting (status label vs. commercial reality)
- **Source:** [DB: public.territories/2026-07-24]
- **Observation:** All 21 `status='sold'` rows are `Demo — <City, ST>`, point-center only, no
  `sold_boundary_geom`, no addressable, not qa_locked.
- **Confidence:** High.
- **Significance:** The `sold` **status flag is present without any frozen exclusivity boundary
  backing it.** A reader trusting the status column alone would overstate real coverage. Real sold
  territories (80+) are absent.
- **Next action:** Do not treat any current DB row as a real sold territory. Real sold rights come
  only from the ArcGIS import (post-cleanup, S3).

### F3 — Zero geometry anywhere in the DB
- **Status:** Verified
- **Source:** [DB: public.territories/2026-07-24] [REPO: supabase/migrations/20260706120000_v3_drive_time_boundary.sql]
- **Observation:** `boundary_geom` and `sold_boundary_geom` are `NULL` on all 67 rows; `formula_version=3` count is 0.
- **Confidence:** High.
- **Significance:** The overlap "sold-clip" logic currently has nothing to clip against
  (as anticipated in [HANDOFF: v2.41 §1]). No self-intersection / overlap / SRID check can be run
  against the DB because there is no geometry to check — those checks belong to the ArcGIS source.
- **Next action:** All geometry-quality validation must be performed on the ArcGIS export once
  access exists (S3).

### F4 — Authoritative legacy sold territories live only in ArcGIS Online
- **Status:** Verified (existence) / Unknown (contents)
- **Source:** [HANDOFF: v2.41 §1–2] [DECISION: #141] [HANDOFF: LATEST.md v2.62 §8]
- **Observation:** ~80+ already-sold territories exist only in ArcGIS Online, not yet in the DB;
  import is deferred pending a Trace-side ArcGIS data-cleanup pass (dedupe sketches, consistent
  name+date, valid geometry, resolve overlaps, consistent schema).
- **Confidence:** High for existence; the count "80+" is a reported figure, not independently counted this session. [PROVISIONAL: validation needed]
- **Significance:** This is the real system of record for existing commercial territory rights and
  the actual subject of decision #141.
- **Next action:** Obtain a read-only ArcGIS export (or Feature Service read) and reconcile count,
  attributes, and geometry.

### F5 — ArcGIS source not reachable this session
- **Status:** Unknown (blocked)
- **Source:** Session tool inventory; `git ls-files` scan for `.geojson/.shp/.kml/.csv/export/arcgis`
- **Observation:** No ArcGIS MCP/connector, no credential, and no tracked ArcGIS export exist in this
  environment. The `data/sources/*.csv` files are credit/county analysis inputs, **not** boundaries.
- **Confidence:** High.
- **Significance:** Every ArcGIS-side geometry-quality question (F7–F10) is unanswerable here.
- **Next action:** Trace/Chat to provide a read-only ArcGIS export or connector; scope a follow-up
  discovery pass over it.

### F6 — Prior CRM exports not located
- **Status:** Unknown (blocked)
- **Source:** [REPO: AGENTS.md (Stack)] (AesthetiX/GHL = "CRM stopgap … pipeline tracking only"); `git ls-files` scan
- **Observation:** No CRM export file is tracked in the repo. AesthetiX/GHL is described as a
  pipeline-tracking stopgap, not a territory-geometry source.
- **Confidence:** Medium (absence in repo is verified; whether an export exists elsewhere is unknown).
- **Significance:** CRM is unlikely to hold authoritative territory geometry, but may hold
  licensee↔territory linkage useful for attribute mapping.
- **Next action:** Ask Trace whether any CRM export carries territory identity/sold-date attributes.

### F7 — Duplicate & abandoned sketches
- **Status:** Unknown (ArcGIS-side)
- **Source:** [DECISION: #141] (cleanup explicitly names "dedupe sketches")
- **Observation:** Cannot be assessed in the DB (no geometry, no duplicate names). This is precisely
  what the deferred Trace-side cleanup targets.
- **Confidence:** n/a (blocked).
- **Significance:** Duplicate/abandoned sketches in ArcGIS would corrupt an import if not filtered.
- **Next action:** Enumerate on the ArcGIS export; agree a discard rule with Trace (question Q4).

### F8 — Invalid or self-intersecting geometry
- **Status:** Unknown (ArcGIS-side)
- **Source:** [REPO: docs/TERRITORY-METHODOLOGY.md §8] (methodology anticipates `ST_MakeValid`)
- **Observation:** No DB geometry to test. PostGIS `ST_IsValid`/`ST_MakeValid` are available for the
  eventual import-time validation. [DB: pg_extension/2026-07-24]
- **Confidence:** n/a (blocked).
- **Significance:** Hand-drawn ArcGIS polygons commonly self-intersect; must be validated before any load.
- **Next action:** Run `ST_IsValid` on the ArcGIS export in a staging area (future, authorized brief).

### F9 — Apparent overlaps between sold territories
- **Status:** Unknown (ArcGIS-side)
- **Source:** [REPO: docs/TERRITORY-METHODOLOGY.md §8.4] (first-territory-sold precedence)
- **Observation:** Cannot be assessed in the DB. Legacy sold territories may already overlap;
  grandfathering is retired [REPO: docs/AGENTS.md, decision #49], so a policy is needed for any
  pre-existing legacy overlaps rather than a freeze rule.
- **Confidence:** n/a (blocked).
- **Significance:** Overlaps between *already-sold* territories are a commercial/legal question, not
  a data-cleaning one — must not be auto-resolved.
- **Next action:** Detect overlaps on the ArcGIS export; escalate any real overlap to Trace/counsel (question Q3).

### F10 — Geometry formats, coordinate systems, SRID conversion
- **Status:** Verified (DB target) / Unknown (ArcGIS source)
- **Source:** [REPO: supabase/migrations/20260706120000_v3_drive_time_boundary.sql] [DB: pg_extension/2026-07-24]
- **Observation:** DB target columns are `geometry(MultiPolygon, 4326)` (WGS84). PostGIS **3.3.7**
  is installed in the `extensions` schema (relocated per [HANDOFF: LATEST.md v2.62 §6]).
  ArcGIS Online commonly serves Web Mercator (**EPSG:3857**) or WGS84 (**EPSG:4326**); the actual
  source SRID and geometry type (Polygon vs MultiPolygon, ring orientation) are unknown until export. [PROVISIONAL: validation needed]
- **Confidence:** High for target; unknown for source.
- **Significance:** An import must reproject to 4326 and coerce to `MultiPolygon`; getting SRID wrong
  silently shifts boundaries.
- **Next action:** Read the ArcGIS layer's spatial reference; plan `ST_Transform(..., 4326)` +
  `ST_Multi` + `ST_MakeValid` in staging.

### F11 — Legal/commercial boundaries that must be preserved exactly
- **Status:** Verified (policy)
- **Source:** [REPO: supabase/migrations/20260706120000_v3_drive_time_boundary.sql] (`sold_boundary_geom` = "FROZEN … written once at close, never recomputed"); [REPO: supabase/migrations/20260710140000_governed_row_write_guards.sql] (freeze trigger); [REPO: docs/TERRITORY-METHODOLOGY.md §8.4]; [HANDOFF: LATEST.md v2.62 §8, §12]
- **Observation:** Existing sold boundaries represent contracted commercial rights. The current v3
  sizing formula (drive-time isochrone; floor 18,600 qualified HH; 5–45 min bounds) would produce
  **different** polygons than legacy hand-drawn ArcGIS boundaries. The freeze is enforced in the live
  DB: trigger `territories_sold_boundary_guard` (BEFORE UPDATE, `WHEN old.sold_boundary_geom IS NOT
  NULL`, function `reject_sold_boundary_change`) is **applied and enabled** (`tgenabled='O'`) as of the
  dated catalog check — though it protects **0 rows today**, since no `sold_boundary_geom` is set yet. [DB: pg_trigger on public.territories/2026-07-24]
- **Confidence:** High. The *mechanism* is Live (dated catalog); its *effect* is latent until a real sold boundary exists.
- **Significance:** **Re-deriving a sold boundary with the current formula would alter contracted
  rights.** The import must load ArcGIS sold polygons verbatim into `sold_boundary_geom`, not size them.
- **Next action:** Import path must write ArcGIS geometry directly (validity-repaired only), never
  route sold territories through the sizing engine.

### F12 — Naming / date / status / identifier normalization needs
- **Status:** Verified (DB side) / Provisional (cross-source)
- **Source:** [DB: public.territories/2026-07-24]
- **Observation:** DB names use an en dash and city–neighborhood form ("Austin – Westlake"); demo
  rows use a "Demo — " prefix; there is **no external/stable identifier** linking a DB row to an
  ArcGIS feature. CRM-003 introduces a stable `territory_family_id` for exactly this. [REPO: docs/GHMD-CRM-003.md (Territory row, Opportunity uniqueness invariant)]
- **Confidence:** High (DB side).
- **Significance:** Without an agreed key, ArcGIS features cannot be matched to future DB rows or to
  licensee/contract records; sold-date and status vocabularies must be normalized to the DB's
  (`available|draft|sold`) plus any new provisional/pipeline/negotiation semantics.
- **Next action:** Define the ArcGIS-attribute → `territories` column mapping and a stable identity
  key before import (question Q5).

### F13 — Conflicts between sources
- **Status:** Conflicting
- **Source:** [DB: public.territories/2026-07-24] vs [DECISION: #141]/[HANDOFF: v2.41 §1]
- **Observation:** DB shows 21 "sold" (demo). ArcGIS holds ~80+ real sold. The National Status Map
  renders DB rows, so it currently depicts **demo coverage, not real coverage**. [REPO: src/lib/__tests__/national-status-map.test.ts]
- **Confidence:** High.
- **Significance:** Any executive artifact or map shown today must be labeled as demo/illustrative,
  not the real network footprint.
- **Next action:** Keep demo/real strictly separated; do not present DB coverage as the network map
  until the ArcGIS import lands.

### F14 — Semantic vocabulary: sold / provisional / pipeline / abandoned / negotiation-redraw
- **Status:** Provisional / partly Unknown
- **Source:** [DB: public.territories] (`available|draft|sold` observed) · [REPO: docs/TERRITORY-METHODOLOGY.md §8.4] (overlap precedence) · [REPO: docs/GHMD-CRM-003.md] (redraw semantics "defined in the Phase 1 Schema Contract"; Territory Versioning is a hard gate)
- **Observation:** The DB status domain today is effectively `available | draft | sold`
  (`reserved_for` column exists but is dead per prior decisions). "Provisional," "pipeline,"
  "abandoned," and "negotiation-redraw" are **not** first-class DB states today; CRM-003 defers redraw
  semantics and Territory Versioning to Phase 1/2. How ArcGIS encodes these is unknown.
- **Confidence:** Medium.
- **Significance:** Mapping ArcGIS statuses onto DB states is ambiguous and partly a **commercial**
  decision (e.g., is a "provisional hold" a sold right?). Must not be assumed.
- **Next action:** Record as questions Q1–Q2 for Trace; do not invent a mapping.

---

## 4. Proposed authoritative source hierarchy (for a FUTURE, separately-approved import)

> Proposal only — not authorization to import. [PROVISIONAL: validation needed]

1. **Existing sold-territory boundaries (legal/commercial):** post-cleanup **ArcGIS Online** is the
   source of truth **until** loaded verbatim into Supabase; on import, `territories.sold_boundary_geom`
   (frozen, write-once) becomes the system of record. [REPO: docs/GHMD-CRM-003.md A.5: "Supabase/PostGIS
   … Authoritative geometry … ArcGIS (transition) … read-only fallback until retirement"]
2. **New / re-sized territory boundaries (pre-sale):** the **v3 drive-time sizing engine** →
   `boundary_geom`. [REPO: docs/TERRITORY-METHODOLOGY.md §8]
3. **Addressable/analysis inputs:** Census ACS (income) + Experian (credit) per
   [REPO: lib/addressable-market-constants.ts]; **never** used to alter a sold boundary.
4. **Attribute/identity (licensee, sold date):** reconcile ArcGIS attributes with any CRM export
   (S4) under an agreed stable key; Supabase is the operating system of record. [REPO: docs/GHMD-CRM-003.md A.5]

---

## 5. Proposed rollback approach for a future import (design sketch only)

> Not executed. Provided so a future import brief can be evaluated for reversibility. [PROVISIONAL: validation needed]

- **Provider backup first.** Confirm a restorable Supabase backup timestamp immediately before any
  load (precedent: the pre-relocation backup in [HANDOFF: LATEST.md v2.62 §6.1]).
- **Batch-tagged, staged load.** Load into a staging table (or tag every imported row with an
  `import_batch_id`) so the entire batch is identifiable and reversible by batch, never row-by-row guesswork.
- **Verbatim sold geometry.** Write ArcGIS sold polygons directly into `sold_boundary_geom`
  (validity-repaired only); never through the sizing engine (F11).
- **Guards remain active.** The existing `qa_locked` and governed-row write guards + `sold_boundary_geom`
  write-once posture protect against silent recompute. [REPO: supabase/migrations/20260710140000_governed_row_write_guards.sql]
- **Reversible = delete the batch + restore-if-needed.** Rollback = delete the tagged batch (no real
  dependents pre-cutover) and, if any dependent write occurred, restore from the pre-load backup.
- **Verification gate.** Post-load, re-run the same read-only inventory in this report and compare
  counts/validity/overlap before declaring success.

---

## 6. Evidence & approvals required before ANY write

1. **Trace's ArcGIS data-cleanup pass complete** (dedupe, consistent name+date, valid geometry,
   overlap resolution, consistent schema) — the explicit precondition of [DECISION: #141].
2. **Read-only ArcGIS export/Feature Service access** to reconcile count, attributes, SRID, validity (F5, F10).
3. **Answers to the commercial-semantics questions Q1–Q5** (see UNRESOLVED-QUESTIONS.md) — Trace decisions, not assumptions.
4. **A separate, approved implementation brief with acceptance criteria** (import is out of scope for
   this discovery brief; [HANDOFF: LATEST.md v2.62 §8, §12]).
5. **Second-Opinion Gate + `ultrareview` tier** on the eventual import PR (auth/RLS/data-migration/
   money-adjacent triggers). [REPO: docs/AGENTS.md Review SOP]
6. **`ops.decision_log` entry authored by Chat** at phase close — Coder reports content + SHA only. [REPO: AGENTS.md Rule 18]

---

## 7. What this report did NOT do (attestation)

No import, migration, geometry redraw/resize/clip/normalize/overwrite, sold-boundary recalculation,
provider-setting change, or `ops.decision_log` write occurred. Only read-only `SELECT`s against
`cprltmwwldbxcsunsafl` and read-only repo inspection were performed. Full attestation in
EXECUTION-REPORT.md.
