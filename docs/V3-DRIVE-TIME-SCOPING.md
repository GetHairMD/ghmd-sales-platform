# V3 Drive-Time Territory Boundary — Technical Scoping

**Status:** Scoping/design only. **Nothing here is implemented, migrated, or live.**
No change to any v2 output. No migration applied. This document turns the
fully-specified methodology in [`docs/TERRITORY-METHODOLOGY.md`](TERRITORY-METHODOLOGY.md)
§8 into an implementable technical plan for a *future* build session.

**Authorization:** `ops.decision_log #82` (Trace, 2026-07-05), opened by Chat.
**Source of truth:** `TERRITORY-METHODOLOGY.md` §8. Where this doc appears to
conflict with §8, §8 wins — such conflicts are **flagged**, not silently resolved
(see [§9 Flags for Trace](#9-flags-requiring-a-trace-decision)).

---

## 0. Current-state findings (verified this session)

Everything below is read from the live repo / `cprltmwwldbxcsunsafl` this session,
and is the factual basis for the plan.

| Fact | Evidence | Consequence for v3 |
|------|----------|--------------------|
| Mapbox Isochrone API is **already called** (client-side, on the territory map). | `src/components/TerritoryDetailMap.tsx:52` — `GET api.mapbox.com/isochrone/v1/mapbox/driving/{lng},{lat}?contours_minutes=30,45&polygons=true`. | The provisioned `NEXT_PUBLIC_MAPBOX_TOKEN` reaches the isochrone endpoint — fit is confirmed, not assumed (§8.6). |
| That token is **client-scoped with a URL/referer restriction**. | `TerritoryDetailMap.tsx:59-61` "401 likely means token URL restriction blocks localhost (Open Item #10)". | v3 evaluation runs **server-side** (batch, not per-page-load). A referer-restricted public token will not authenticate server calls → **token provisioning flag** (§9). |
| **PostGIS is available but NOT installed.** | `list_extensions`: `postgis` `installed_version: null`, `default_version: 3.3.7`. Also available-not-installed: `postgis_topology`, `postgis_raster`, `pgrouting` 3.4.1, `earthdistance`+`cube`. | Enabling PostGIS is a `CREATE EXTENSION` = an **extension change** → not scoping-session-executable → **Trace decision** (§9). |
| `territories` has **no geometry column**. | `list_tables`: `territories` has `center_lat`, `center_lng`, `drive_time_minutes` (default 30), `outer_ring_minutes` (default 45), `addressable_patients_primary/outer`, `formula_inputs jsonb`, `census_raw_data jsonb`, `census_fetched_at`. | Isochrones today are **cosmetic** — drawn live on the map, never persisted, and **not** what the formula runs on. v3's whole point is to make the polygon the boundary the formula uses. New storage is required. |
| The only persisted polygon today is a **GeoJSON-in-jsonb snapshot**. | `proposals.territory_polygon jsonb`. | Precedent exists for GeoJSON-in-jsonb; but it is a display snapshot, with no server-side spatial-op capability. |
| Addressable formula runs on **county/ZCTA ACS**, not on a polygon. | `src/lib/census.ts` (`fetchB19001ForCounty`, `computeAddressableMarket`), `src/lib/income-screen.ts` (`fetchB19001ForZcta`). | The v2→v3 integration point is a **new polygon→households producer**; the arithmetic downstream is reusable (see §3). |
| A HUD ZIP↔county crosswalk ships in-repo. | `data/hud-usps-zip-county-crosswalk.json`; referenced by `income-screen.ts` ("ZCTA→territory association comes from the HUD crosswalk"). | Relevant to, but **not sufficient** for, polygon apportionment (a crosswalk maps whole geographies; it does not clip them to an arbitrary polygon). |

**Verified Mapbox Isochrone limits (docs.mapbox.com, this session):** 300 requests/min;
**max 4 contours per request**; **max 60 minutes per contour** (the 45-min ceiling fits);
`polygons=true` returns GeoJSON polygons; `denoise` default `1.0` returns only the
largest contour; `generalize` "can lead to self-intersections." **Pricing:** first
**100,000 requests/month free**, then $2.00 / $1.60 / $1.20 per 1,000 at the
100k / 500k / 1M tiers.

---

## 1. Isochrone computation approach

### 1.1 Fit for purpose — confirmed
The Isochrone API is already in production use for the map overlay, so the vendor,
endpoint, and token capability are proven. v3 differs only in *where* and *why* the
call is made:

- **Where:** move the call **server-side** (a Supabase Edge Function or a Next.js
  route running with a server token), invoked during **candidate-territory
  evaluation** — not per page load. The client map keeps its own display call.
- **Why:** the returned polygon becomes the input to household qualification and to
  overlap clipping, so it must be computed in a trusted context and persisted.

### 1.2 Output format — compatible with both storage options
`polygons=true` returns a GeoJSON `FeatureCollection` of `Polygon`/`MultiPolygon`
features (one per contour). That is directly:
- storable as `jsonb` (as `proposals.territory_polygon` already does), and
- ingestible into PostGIS via `ST_GeomFromGeoJSON(...)` → `geometry(MultiPolygon,4326)`.

Two **geometry-hygiene** caveats that the build must handle:
- **`denoise`:** a driving isochrone can be disconnected (islands, highway pockets).
  Default `1.0` keeps only the largest contour, which is what a *defensible single
  catchment* wants — but this is a **methodology-visible choice** (it discards
  reachable-but-detached pockets). Recommend `denoise=1.0` and flag it (§9).
- **`generalize`:** Mapbox warns generalization "can lead to self-intersections."
  Any polygon must be validated (`ST_MakeValid`, or turf `cleanCoords` +
  `unkinkPolygon`) **before** any area/difference/contains operation, or spatial ops
  will throw or return garbage.

### 1.3 Rate limits / cost at expected volume
Volume is **candidate evaluation**, not per-page-load. A single candidate needs at
most a handful of calls: one multi-contour probe (up to 4 contours) plus an optional
refinement call (§3.1) — call it ≤6 requests per candidate territory sized. Even at
hundreds of candidates per month this is **far inside the 100k/month free tier** and
nowhere near 300 req/min. **Cost is effectively zero at Phase-1 volume**; the free
tier only becomes a consideration at ~16k+ candidate-sizings/month. No cost blocker.

---

## 2. Data model / storage plan

### 2.1 Options and tradeoffs

| Option | What | Pros | Cons |
|--------|------|------|------|
| **A. PostGIS geometry column** | `boundary_geom geometry(MultiPolygon,4326)` on `territories` (+ GiST index). | Native `ST_Area`, `ST_Intersection`, `ST_Difference`, `ST_Contains`; DB is the arbiter of "what area is already sold"; spatial joins for census apportionment; indexable. | Requires enabling PostGIS (Trace decision, §9). |
| **B. GeoJSON in `jsonb`** | Same shape as `proposals.territory_polygon`. | Zero new extension; matches existing precedent. | **No server-side geometry ops.** Overlap clipping (§8.4) and polygon area/point-in-polygon must all be done in app code (turf.js) in an Edge Function; no spatial index; harder to audit. |
| **C. Hybrid** | `jsonb` GeoJSON as render source of truth **+** a derived PostGIS column for ops. | Rendering stays jsonb-simple; spatial ops get PostGIS. | Two representations to keep in sync; still needs PostGIS. |

### 2.2 Recommendation
**Option A (PostGIS geometry column).** The deciding factor is that §8.4 overlap
resolution *is* a geometry-difference operation and §8.3 sizing needs polygon area and
point-in-polygon against census geographies. Doing that in app code (Option B) is
possible with turf.js but forfeits the database as the single arbiter of sold-area and
forfeits spatial-join apportionment. **If Trace declines PostGIS**, the documented
fallback is Option B: turf.js inside an Edge Function, accepting no spatial index and
app-side clipping. Recommend A; treat B as the contingency.

### 2.3 PostGIS enablement — flagged, not executed
PostGIS is present on `cprltmwwldbxcsunsafl` at 3.3.7 but **not installed**. Enabling
it is `CREATE EXTENSION postgis;` — an extension change, explicitly **out of scope for
a scoping session** and a **Trace decision** (§9). Supabase supports it as a
first-class extension, so there is no platform blocker — only a governance gate.

### 2.4 Migration sketch (DO NOT APPLY — illustration only)
Naming would follow the repo convention `YYYYMMDDHHMMSS_description.sql` (latest in-repo
is `20260705140000_...`). Rough shape, for a *future* build PR:

```sql
-- SKETCH ONLY — not written, not applied this session.
-- create extension if not exists postgis;                 -- gated on Trace (§2.3)

alter table public.territories
  add column formula_version    smallint  not null default 2,   -- 2 = ZCTA/county (v2), 3 = drive-time (v3)
  add column boundary_geom      geometry(MultiPolygon, 4326),   -- the sized v3 boundary
  add column boundary_geojson   jsonb,                          -- render/source copy (turf fallback + client map)
  add column boundary_minutes   integer,                        -- drive-time that produced boundary_geom (≤ 45)
  add column boundary_source    jsonb,                          -- {mapbox_profile, denoise, generalize, isochrone_fetched_at}
  add column sold_boundary_geom geometry(MultiPolygon, 4326);   -- FROZEN at close; immutable (see §4.2)

create index territories_boundary_geom_gix      on public.territories using gist (boundary_geom);
create index territories_sold_boundary_geom_gix on public.territories using gist (sold_boundary_geom);
-- RLS: inherits existing territories policy posture (service-role-only); no new anon/authenticated access.
```

Notes on the sketch:
- `formula_version` is the **rollout discriminator** (see §7). v2 rows keep `2`; the
  column defaulting to `2` guarantees **no existing row changes behavior**.
- `sold_boundary_geom` is deliberately **separate** from `boundary_geom`: the sold
  boundary must be frozen at close and never recomputed (§4.2), whereas `boundary_geom`
  is the current sizing output and may be re-derived pre-sale.
- SRID **4326** (WGS84 lat/lng) matches Mapbox output; area math uses `geography` casts
  or an equal-area projection (see §3.2 note).

---

## 3. Expansion algorithm design

### 3.1 Isochrone increment strategy (§8.3)
Goal: the **smallest** drive-time radius whose **addressable** households (after income
**and** credit qualification) clear the floor of **18,600** (= 93 ÷ 0.005; 93 = 62 ×
1.5), capped at **45 minutes**.

Proposed **coarse-to-fine** search (minimizes Mapbox calls, exploits the 4-contours/req
limit):
1. **Coarse probe:** one request, `contours_minutes=15,25,35,45` (4 contours). For each,
   compute addressable inside (§3.2). This brackets the answer in one call.
2. **Stopping condition:** let `m* = min{ m : addressable(m) ≥ 18,600 }`.
   - If `m*` exists among the probes, **refine** with a second request over the
     1-minute range between the last-failing and first-passing contour (e.g.
     `contours_minutes=31,32,33,34` if the jump was 25→35) to land the smallest integer
     minute. Boundary = isochrone at `m*` (integer-minute resolution is sufficient;
     Mapbox contours are integer minutes).
   - If **no** probe ≥ 18,600 and even the 45-min contour falls short → return the
     typed state **`UNRESOLVED_BELOW_THRESHOLD_AT_CEILING`** (see §5). **Do not** size
     at 45 min and present it as viable.
3. **Ceiling (§8.3, hard):** 45 is never exceeded. Because Mapbox caps at 60 min/contour,
   the ceiling is inside the API's own limit — no vendor workaround needed.

Minimum-radius floor is **deferred** (§8.5) — the loop simply starts at the smallest
probe contour; no floor is enforced.

### 3.2 Applying income + credit qualification *within* a polygon — the core v2→v3 join
This is the crux. The Census API serves histograms only for **standard geographies**
(county / ZCTA / tract / **block group**), never for an arbitrary polygon. So a v3
"households in this polygon" number must be **apportioned** from standard geographies:

1. **Select** the census geographies intersecting the isochrone — **block groups**
   preferred (finest B19001 geography), tracts acceptable as a coarser fallback.
2. **Weight** each intersecting geography `g` by the fraction of it inside the polygon:
   - *Areal* weighting: `w_g = area(g ∩ iso) / area(g)` — assumes uniform household
     density within `g` (a standard, disclosed approximation).
   - *Population/household-weighted* (more accurate): use block-level household
     denominators inside `g ∩ iso` as weights. Higher fidelity, more data/plumbing.
   - **Which one is a methodology choice that changes outputs → Trace + decision-log,
     not a silent Coder pick** (§9).
3. **Apportion** each B19001 bracket count by `w_g` and **sum across all `g`** into a
   single synthetic B19001 histogram for the polygon.
4. **Qualify — reusing v2 code unchanged:** feed that histogram to
   `incomeQualifiedShare()` and multiply through `addressableHouseholds()`.

**Area math note:** `ST_Area` on `geometry(...,4326)` returns degrees², not a real area.
Use `geography` casts (`ST_Area(geom::geography)`) or reproject to an equal-area CRS
(e.g. US Albers, EPSG 5070) for the `w_g` ratios. Ratios are unit-invariant as long as
numerator and denominator use the same measure, but pick one and be consistent.

### 3.3 Exact function-level impact on `lib/addressable-market-constants.ts` consumers
Mapped from the code read this session. **No v2 output changes** — v3 adds a parallel path.

**Reusable as-is (geometry-agnostic — take a histogram/number, return a share/number):**
- `incomeQualifiedShare(b19001, threshold)` — `src/lib/income-screen.ts`. Pure over a
  B19001 map. **The synthetic polygon histogram (§3.2 step 3) plugs straight in.**
- `bracketQualifyingFraction(lower, upper, threshold)` — same file. Pure.
- `addressableHouseholds(households, incomeShare, creditShare)` — `src/lib/addressable.ts`. Pure multiply.
- `penetrationScenarios()`, `viabilityLevel()`, `expectedCustomers()` — `src/lib/territory-sizing.ts`. Pure.

**Reusable with a new v3 constant (not a rewrite):**
- `minAddressableForFloor(rate)` — `src/lib/territory-sizing.ts`. Today returns
  `ceil(CUSTOMERS_NEEDED / rate)` = `ceil(62/0.005)` = **12,400**. v3's floor uses the
  **1.5× buffer**: `ceil(93/0.005)` = **18,600**. Add v3 constants
  (`V3_VIABILITY_BUFFER = 1.5`, derived `V3_MIN_VIABLE_CUSTOMERS = 93`,
  `V3_MIN_ADDRESSABLE_FLOOR = 18,600`, `V3_MAX_DRIVE_MINUTES = 45`) **alongside** the v2
  constants — never mutating `CUSTOMERS_NEEDED` or the existing penetration constants.

**Needs new logic (geography-specific — the replacement points):**
- `fetchB19001ForCounty()` (`src/lib/census.ts`) and `fetchB19001ForZcta()`
  (`src/lib/income-screen.ts`) → **replaced** by a new `fetchB19001ForPolygon()` that
  does the intersect-and-apportion of §3.2. This is the bulk of the new build.
- `creditShareForState(state, table)` (`src/lib/credit-share.ts`) → a polygon can span
  **multiple states**. Needs a household-weighted blend of per-state credit shares
  across the polygon (or a documented "practice's state governs" rule). This is a
  **methodology choice** (it changes the number) → Trace + decision-log (§9).
- `computeAddressableDetail()/computeAddressableMarket()` (`src/lib/census.ts`) → a v3
  orchestrator variant that takes a polygon, calls `fetchB19001ForPolygon()`, and
  applies the multi-state credit blend, then reuses `addressableHouseholds()`.

---

## 4. Overlap resolution — geometry clipping (§8.4)

### 4.1 Approach
First-territory-sold precedence = **subtract sold area before the viability check**:

```
sold_union      = ST_Union(all sold_boundary_geom)                 -- every already-sold territory
candidate_clip  = ST_Difference(candidate_isochrone, sold_union)   -- unclaimed area only
candidate_clip  = ST_MakeValid(candidate_clip)                     -- guard self-intersections
addressable     = qualify(candidate_clip)                          -- §3.2 on the CLIPPED polygon
```

The expansion loop (§3.1) runs on `candidate_clip`, so if clipping drops the candidate
below 18,600 it keeps expanding **up to 45 min** to independently clear the floor within
the remaining unclaimed area — exactly §8.4. If it can't even at 45 min → `UNRESOLVED`
(§5). In the turf/Option-B fallback, `turf.difference` + `turf.area` +
`turf.booleanPointInPolygon` are the equivalents.

### 4.2 What "already-sold" boundary storage looks like
Given §2, a sold boundary is a **frozen** `sold_boundary_geom` on `territories`, written
**once at close** and never recomputed. Freezing is mandatory, not stylistic: Mapbox
road networks and isochrone outputs drift over time, so re-deriving a sold territory's
polygon later would silently move a licensee's exclusivity line. Implications to build:
- A **sold state + sold order** is needed. `territories.status` is currently free text
  (default `'available'`, no check constraint) and there is no persisted sold geometry.
  Precedence order should key off a real close timestamp — `deals.signed_at` is the
  natural candidate — so ties resolve deterministically. **Firm up the sold-state model
  and precedence key** in the build (flagged, §9, as it touches commercial semantics).
- `proposals.territory_polygon` is a **proposal-time snapshot** and is *not* the
  authoritative sold boundary; the authoritative frozen boundary belongs on
  `territories` (or a dedicated sold-boundaries table) written at close.

---

## 5. Unresolved-case handling (flag only — §8.3)

When a candidate cannot clear the 93-customer / 18,600-addressable floor even at the
45-minute ceiling (e.g. a low-density rural market), §8.3 is explicit that the
resolution — "not currently sellable as a standalone territory" vs. "sellable under
different economics" — is a **Trace pricing decision, out of scope**. This document does
**not** propose a resolution.

The only technical requirement noted here: the sizing routine must return an explicit,
typed **`UNRESOLVED_BELOW_THRESHOLD_AT_CEILING`** outcome (carrying the best-achieved
addressable at 45 min) and must **never** silently emit a 45-minute boundary as if it
were viable. The UI/authoring flow then routes that outcome to a Trace decision rather
than to a saleable territory. **Known gap, owner = Trace.**

---

## 6. v3 QA anchor strategy

The v2 anchors — national **69.6M**/**56.3M**, **Marin 64,194**, and the Sprint-1
**Austin Westlake 5,483** — are ZCTA/county-based and **will not reproduce** under
polygon geography (§8.7). They are retained as the **legacy v2 regression check only**.

**Proposed method to establish v3 anchors (no placeholder numbers fabricated):**
1. **Pick 2–3 real reference practice locations** as fixtures — natural candidates are
   the existing three `territories` rows and/or the Austin Westlake pin (so v2↔v3 can be
   compared at the same location, illustrating the expected *shrink*).
2. **Freeze the isochrone as a test fixture.** Capture the exact Mapbox GeoJSON for each
   reference at sizing time and **commit it as a static fixture** — the anchor must be
   deterministic and offline. If a v3 anchor re-called Mapbox live in CI, road-network
   drift would make it flaky and non-reproducible. Pin the polygon, not the API call.
3. **Compute v3 addressable** through the real §3.2 pipeline over the frozen fixture.
4. **Trace signs off** on the resulting numbers; they are then locked as regression
   fixtures via a dedicated `ops.decision_log` entry (per §8.7). Only after lock do they
   become the ongoing v3 regression target.

The actual anchor values are **produced by the implementation, then approved** — they
cannot be stated now, and this doc does not invent them.

---

## 7. Rollout / cutover shape (recommendation for Trace)

**Recommendation: additive, opt-in per territory — not a hard cutover.**
- Add `formula_version` (2 | 3) as the discriminator; **v2 stays the default.**
- Existing territories (3 rows, all v2) **remain v2** until explicitly re-sized under v3.
- New v3 constants are **added alongside** v2 constants in
  `lib/addressable-market-constants.ts`; v2 constants and outputs are untouched
  (respects the hard boundary in this session's brief and Rule 6).

**Why not a hard cutover for sold territories:** v3 deliberately produces **smaller**
boundaries. Auto-re-sizing an already-sold territory would **shrink a licensee's
exclusivity area** — a commercial and potentially legal act. That must be Trace-
controlled per territory, never an automatic migration. New candidate territories can be
authored v3-first once the build lands; sold v2 territories convert only by explicit
Trace direction.

**Rough complexity / effort for the follow-on build session(s):** medium-to-large,
naturally several PRs through the gate:
- **(a)** PostGIS enable + migration — *small*, but **gated on Trace** (§2.3).
- **(b)** Server-side isochrone fetch + `fetchB19001ForPolygon()` apportionment — **the
  bulk and the main technical risk** (census block-group intersection + areal/pop
  weighting + multi-state credit blend). *Large.*
- **(c)** Expansion + clipping algorithm + v3 constants + `UNRESOLVED` state — *medium*.
- **(d)** v3 QA fixtures + Trace anchor lock (§6) — *small–medium*.
- **(e)** UI wiring (territory authoring shows/persists the dynamic v3 boundary; the
  30/45 two-ring display concept is superseded by one dynamic ring, see §9) — *medium*.

The apportionment layer (b) is where estimate risk concentrates; a spike on
block-group intersection accuracy would de-risk the rest.

---

## 8. Conformance to §8 (no silent conflict resolution)

Mechanism (§8.2), sizing rule + 1.5× buffer + 0.5% anchor (§8.3), 45-min ceiling
(§8.3), first-sold overlap precedence (§8.4), and the deferred minimum floor (§8.5) are
all reflected above exactly as specified. Nothing in §8 was overridden. Items where §8
leaves a technical or business choice open are collected below rather than decided here.

---

## 9. Flags requiring a Trace decision

Ordered roughly by how early the build needs each answered.

1. **PostGIS enablement** (§2.3) — `CREATE EXTENSION postgis;` is an extension change,
   not scoping-executable. Needed before Option-A storage. *If declined,* build proceeds
   on the Option-B turf.js fallback (slower, app-side clipping, no spatial index).
2. **Server-side Mapbox token** (§1.1) — the live `NEXT_PUBLIC_MAPBOX_TOKEN` is
   client/referer-restricted (Open Item #10). Server-side batch sizing needs a
   server-usable token. Secret handling is **Trace-only** (Hard Rule 6) — provisioning,
   not code.
3. **Apportionment weighting: areal vs. population-weighted** (§3.2) — changes the
   addressable number → a methodology decision, so Trace + `ops.decision_log`, not a
   silent Coder default.
4. **Multi-state credit-share rule** (§3.3) — how `creditShareForState` generalizes when
   a polygon spans states (household-weighted blend vs. "practice's state governs").
   Also output-changing → Trace + decision-log.
5. **`denoise` policy** (§1.2) — whether detached-but-reachable pockets count toward the
   catchment. Recommend `denoise=1.0` (largest contour only); confirm.
6. **Sold-state model + precedence key** (§4.2) — firm up `territories.status` sold
   semantics and the ordering key (proposed `deals.signed_at`) for first-sold
   precedence; touches commercial exclusivity, so Trace confirms.
7. **Unresolved-at-ceiling economics** (§5) — the §8.3 open case; explicitly a Trace
   pricing decision, noted as a known gap only.
8. **Two-ring → single-ring display** (§7e) — v2's fixed `DRIVE_TIME_PRIMARY_MINUTES`
   (30) / `DRIVE_TIME_OUTER_MINUTES` (45) two-ring model is conceptually superseded by
   one **dynamic** boundary ≤ 45 min. Consistent with §8.2 ("replaces … entirely"), but
   it changes what the proposal map shows — confirm the intended v3 presentation.

**None of these are Coder decisions.** They are surfaced for Trace/Chat before a build
session opens.
