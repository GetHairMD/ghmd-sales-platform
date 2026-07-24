# Source Register — Territory Discovery & Executive Presentation

Maps every substantive **finding** (RECONCILIATION-REPORT.md, prefix `F`) and every **presentation
claim** (EXECUTIVE-PRESENTATION.md / SYSTEM-MAP.md, prefix `P`) to its evidence and evidence strength.

**Query date for all `[DB: …]` rows:** 2026-07-24, project `cprltmwwldbxcsunsafl` (read-only).
**Evidence strength** uses the handoff vocabulary [HANDOFF: LATEST.md v2.62 §2]: *Derived live*,
*Provider-confirmed*, *User-confirmed*, *Historical*, plus *Provisional* for anything needing validation.

---

## A. Discovery findings → evidence

| Ref | Claim (short) | Status | Source tag(s) | Strength |
|---|---|---|---|---|
| F1 | DB territory data is 100% demo/QA fixture | Verified | [DB: public.territories/2026-07-24] | Derived live |
| F2 | 21 `sold` rows are demo, not contracted | Conflicting | [DB: public.territories/2026-07-24] | Derived live |
| F3 | Zero geometry on all rows; 0 v3 rows | Verified | [DB: public.territories/2026-07-24]; [REPO: supabase/migrations/20260706120000_v3_drive_time_boundary.sql] | Derived live |
| F4 | 80+ real sold territories only in ArcGIS | Verified (exist) / Unknown (contents) | [HANDOFF: v2.41 §1–2]; [DECISION: #141] | Historical |
| F5 | ArcGIS source unreachable this session | Unknown (blocked) | Session tool inventory; `git ls-files` scan | Derived live |
| F6 | Prior CRM exports not located | Unknown (blocked) | [REPO: AGENTS.md (Stack: CRM stopgap AesthetiX/GHL)]; `git ls-files` scan | Derived live |
| F7 | Duplicate/abandoned sketches | Unknown (ArcGIS-side) | [DECISION: #141] | Provisional |
| F8 | Invalid/self-intersecting geometry | Unknown (ArcGIS-side) | [REPO: docs/TERRITORY-METHODOLOGY.md §8]; [DB: pg_extension/2026-07-24] | Provisional |
| F9 | Overlaps between sold territories | Unknown (ArcGIS-side) | [REPO: docs/TERRITORY-METHODOLOGY.md §8.4]; [REPO: docs/AGENTS.md decision #49] | Provisional |
| F10 | SRID/format: DB=4326 MultiPolygon, PostGIS 3.3.7 in `extensions`; ArcGIS SRID unknown | Verified (target) / Unknown (source) | [REPO: supabase/migrations/20260706120000_v3_drive_time_boundary.sql]; [DB: pg_extension/2026-07-24]; [HANDOFF: LATEST.md v2.62 §6] | Derived live / Provisional |
| F11 | Sold boundaries must be preserved exactly, never recomputed | Verified (policy) | [REPO: supabase/migrations/20260706120000_v3_drive_time_boundary.sql]; [REPO: docs/TERRITORY-METHODOLOGY.md §8.4]; [HANDOFF: LATEST.md v2.62 §8,§12] | Historical |
| F12 | Naming/date/identifier normalization; no stable cross-source key | Verified (DB) / Provisional | [DB: public.territories/2026-07-24]; [REPO: docs/GHMD-CRM-003.md] | Derived live / Provisional |
| F13 | Source conflict: DB demo coverage ≠ ArcGIS real coverage; National Map shows demo | Conflicting | [DB: public.territories/2026-07-24]; [REPO: src/lib/__tests__/national-status-map.test.ts] | Derived live |
| F14 | sold/provisional/pipeline/abandoned/redraw semantics partly undefined in DB | Provisional/Unknown | [DB: public.territories]; [REPO: docs/TERRITORY-METHODOLOGY.md §8.4]; [REPO: docs/GHMD-CRM-003.md] | Provisional |

### Supporting DB queries executed (all read-only, 2026-07-24)

| Query | Result summary |
|---|---|
| Project confirmation (`list_projects`) | `cprltmwwldbxcsunsafl` = ghmd-sales-platform (target); NIP `kjweckggegifjmmqccul` never queried |
| Territory overview counts/filters | 67 rows; 45 avail / 21 sold / 1 draft; all fv2; 0 boundary_geom; 0 sold_boundary_geom; 3 addressable |
| Row sample (status, name, center, addr, created_at) | 63 `Demo —` rows, 3 anchors, 1 QA draft |
| Name/qa_locked classification | demo 63 (0 locked); anchors 3 (3 locked); qa_fixture 1; OTHER 0 |
| Related tables + duplicate names | sizing_jobs 15; scouting_reports 3; deals 28/28; duplicate names none |
| PostGIS presence/schema | postgis 3.3.7 in `extensions` |
| Governed-row guard triggers on `public.territories` *(added in the 2026-07-24 correction session)* | `territories_sold_boundary_guard`, `territories_qa_lock_guard`, `territories_qa_lock_delete_guard` all present with `tgenabled='O'` (enabled) |

---

## B. Presentation claims → evidence & lifecycle label

Lifecycle labels: `Live` · `Built, unvalidated` · `In development` · `Approved future design` ·
`Concept requiring approval` · `Human only`.

| Ref | Presentation claim (short) | Lifecycle | Source tag(s) |
|---|---|---|---|
| P1 | Formula v2 (households × income-qualified × credit-eligible; no prevalence) governs addressable | Built, unvalidated (constants locked & documented; no dated live in-app run — anchor numbers in DB were seeded) | [REPO: lib/addressable-market-constants.ts]; [REPO: docs/AGENTS.md Locked Technical Facts] |
| P2 | v3 drive-time isochrone sizing engine (floor 18,600 HH; 5–45 min; ×1.5 buffer; 0.5% Conservative anchor) | Built, unvalidated | [REPO: lib/addressable-market-constants.ts §v3]; [REPO: docs/TERRITORY-METHODOLOGY.md §8]; [REPO: src/lib/__tests__/v3-constants.test.ts]; [DB: 0 fv3 rows/2026-07-24] |
| P3 | Supabase/PostGIS = authoritative geometry & system of record | Live (infra: PostGIS 3.3.7 in `extensions`, dated catalog) / Approved future design (as authoritative territory store) | [DB: pg_extension/2026-07-24]; [REPO: docs/GHMD-CRM-003.md A.5] |
| P4 | Mapbox = map display, drawing, isochrone, negotiation editing | Built, unvalidated (display/isochrone — token provisioned, op unverified) / Approved future design (editing) | [REPO: AGENTS.md (Environment Variables: `NEXT_PUBLIC_MAPBOX_TOKEN`)]; [REPO: docs/GHMD-CRM-003.md A.5]; [REPO: docs/TERRITORY-METHODOLOGY.md §8.6] |
| P5 | Census ACS (B19001 income) input | Live (Production Census-backed request verified) | [HANDOFF: LATEST.md v2.62 §4.2]; [REPO: AGENTS.md (Environment Variables: `CENSUS_API_KEY`)]; [REPO: lib/addressable-market-constants.ts] |
| P6 | Credit-quality data (Experian FICO≥670 share, per-state) input | Built, unvalidated (data present in repo; live consumption unverified) | [REPO: data/sources/GHMD_State_Analysis_Data_Dump.csv]; [REPO: lib/addressable-market-constants.ts] |
| P7 | ArcGIS = historical parity / read-only fallback during transition | Approved future design (transition) | [REPO: docs/GHMD-CRM-003.md A.5]; [DECISION: #141] |
| P8 | Sold-boundary preservation (frozen `sold_boundary_geom`, write-once) | Live (guard `territories_sold_boundary_guard` applied & enabled per dated catalog; guards 0 rows today) | [DB: pg_trigger on public.territories/2026-07-24]; [REPO: supabase/migrations/20260710140000_governed_row_write_guards.sql]; [REPO: supabase/migrations/20260706120000_v3_drive_time_boundary.sql] |
| P9 | Negotiation redraw semantics | Approved future design | [REPO: docs/GHMD-CRM-003.md] (redraw "defined in Phase 1 Schema Contract"; Territory Versioning hard gate) |
| P10 | National Network Map | Built, unvalidated (map route exists in code; live render not verified this session) — currently demo data | [REPO: src/app/(app)/national-map/page.tsx]; [REPO: src/lib/__tests__/national-status-map.test.ts]; [DB: F13] |
| P11 | Qualification gate | Built, unvalidated | [REPO: supabase/migrations/20260709120000_qualification_gate_schema_rls.sql]; [REPO: docs/AGENTS.md] |
| P12 | Proposal gate / proposal system | Built, unvalidated (revenue `scenario_outputs` have no formula-v2 producer — seeded illustrative-only, decision #71) | [REPO: docs/TERRITORY-METHODOLOGY.md §7]; [REPO: supabase/migrations/20260705003707_proposal_system_p1.sql]; [REPO: src/app/p/[slug]/page.tsx] |
| P13 | Zoom meeting entry / script panel / required questions / consent / transcript capture | Approved future design (Phase 3) | [REPO: docs/GHMD-CRM-003.md A.5, Phase 3]; no such code in `src/` this session |
| P14 | Separate prospect evaluation vs salesperson evaluation | Built, unvalidated (ICP prospect score column) / Concept requiring approval (AI call scoring) | [DB: prospects.icp_score]; [REPO: supabase/migrations/20260625020853_sprint1_foundation.sql (`call_scores` table)]; [REPO: docs/GHMD-CRM-003.md Phase 4] |
| P15 | Outlook-derived communication summaries | Approved future design (Phase 3) | [REPO: docs/GHMD-CRM-003.md §12.1, Phase 3]; no MS-Graph code in `src/` this session |
| P16 | AI summaries / missing-info detection / stalled-deal alerts / next steps | Approved future design (Phase 4 AI); rule-based stalled trigger in code = Built, unvalidated | [REPO: docs/GHMD-CRM-003.md Phase 4]; [REPO: src/lib/dashboard/triggers.ts] |
| P17 | Controlled, low-risk automation | Approved future design (Phase 3) | [REPO: docs/GHMD-CRM-003.md Phase 3] |
| P18 | Consequential decisions are Human-only | Human only | [REPO: docs/GHMD-CRM-003.md §11.3 authority gate]; [HANDOFF: LATEST.md v2.62 §10.3] |
| P19 | Permission-safe retrieval, citations, confidence, model/rubric version, reviewer edits, overrides, audit history | Approved future design (Phase 4 exit gate) | [REPO: docs/GHMD-CRM-003.md Phase 4 exit gate, §11]; [HANDOFF: LATEST.md v2.62 §10.3] |
| P20 | Territory standard price $179,000 (Phase 1, non-negotiable) | **Live policy** — $179,000 is the in-force standard, Human-only to change [REPO: AGENTS.md (Key Reference Values)]. Separately, the `deals.territory_price` schema default is **Built, unvalidated** — it exists in repository implementation but has not been confirmed by a dated live catalog query [REPO: supabase/migrations/20260625020853_sprint1_foundation.sql] | see status cell (policy vs. schema default cited separately) |

---

## C. Tag legend

- `[REPO: path]` — file in this repository at HEAD (2026-07-24).
- `[DB: schema.table/query date]` — read-only Supabase query, project `cprltmwwldbxcsunsafl`.
- `[HANDOFF: section]` — `handoffs/LATEST.md` (v2.62) or a named prior handoff.
- `[DECISION: #n]` — `ops.decision_log` decision (read via handoff/live queue; **not** written).
- `[PROVIDER: system/date]` — provider-confirmed fact.
- `[USER-CONFIRMED: date]` — action reported by Trace.
- `[PROVISIONAL: validation needed]` — asserted but not verified this session; must be validated before reliance.
