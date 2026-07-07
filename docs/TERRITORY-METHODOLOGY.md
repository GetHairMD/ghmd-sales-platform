# GHMD Territory Sizing Methodology (Formula v2)

**Status:** Authoritative once merged; supersedes all uploaded/offline copies.
**Governance:** Territory/formula methodology is owned solely by Trace, who is
the final sign-off authority for this document and all changes to it.
**Sensitivity:** Formula mechanics (income thresholds, credit methodology, PTI
levels) are corporate-only — Trace-only. Salespeople and prospects see
**outputs only**, never this document or its mechanics (Hard Rule 1). The
public proposal page carries zero viability semantics (Hard Rule 2).

---

## 1. Purpose

Defines how the platform computes the addressable market for a candidate
territory. This is the single narrative source for formula v2. The single
**code** source for all constants is `lib/addressable-market-constants.ts`
(Rule 6) — where this document and the code disagree, the code as governed by
the decision log wins, and this document must be corrected by PR.

## 2. The Formula (v2 — current, implemented)
```

Addressable households = households (territory) × income-qualified share (ACS B19001, ZCTA-level, straddle interpolation) × credit-eligible share (state-level CSV, Experian-derived)

```

**There is no prevalence term.** Prevalence was removed by decision **#46**
(locked). Never reintroduce a hair-loss-prevalence multiplier or any
clinical-incidence factor.

## 3. Income Qualification

- Source: ACS table **B19001** (household income distribution) at **ZCTA**
  level.
- The qualifying income threshold derives from the financing anchor:
  **$8,500 financed @ 24.99% APR / 60 months → $249.44/month → $37,415
  minimum annual household income at 8% payment-to-income (PTI).**
- Where the threshold falls inside a B19001 income bracket, the qualified
  share of that bracket is estimated by **straddle interpolation**
  (implementation in code is authoritative for the interpolation mechanics).
- **PTI5 is not stored server-side.** The compute-vs-store decision for the
  5% PTI variant is deferred (locked fact). Do not add storage for it without
  a decision-log entry.

## 4. Credit Eligibility

- Source: state-level credit-eligibility shares from the **Experian-derived
  state CSV** shipped in-repo. Applied as a single multiplier per territory's
  state.
- Provenance and refresh cadence of the CSV are a Trace governance item; the
  file in-repo is authoritative for computation until replaced by PR.

## 5. QA Anchors — v2, ZCTA-based geography (regression checks)

Any v2 implementation change must reproduce, exactly:

| Check | Expected |
|---|---|
| National addressable @ PTI8 | **69.6M** households |
| National addressable @ PTI5 | **56.3M** households |
| Marin County territory | **exactly 64,194** |

**These anchors are specific to ZCTA/county-based geography.** See §8 — once
the drive-time boundary enhancement ships, these become the legacy v2
regression check, not the ongoing target.

## 6. Downstream Derived Figures

- **CUSTOMERS_NEEDED = 62.** Single source: `lib/addressable-market-constants.ts`.
- **Penetration scenarios: 0.5% / 1% / 2%**, labeled **Conservative / Base /
  Upside**, **computed on render — never stored.**
- Territory price **$179,000** is commercial policy (AGENTS.md hard
  boundary), not a formula output.

## 7. What the Formula Does NOT Produce (legal boundaries)

- **Age/sex demographic tables** shown in proposals are sourced as **Census
  demographics (B01001)** and carry **no propensity or clinical-demand
  claim** (decision **#68**, `legal_flag: true`, unresolved/standing).
- **Revenue `scenario_outputs`** (conservative/moderate/growth revenue,
  break-even) have **no formula-v2 producer** — currently seeded
  **illustrative-only** (decision **#71**, `legal_flag: true`,
  unresolved/standing).
- Neither item may reach a real prospect or Rick Dahlson-reviewed material
  until its decision is resolved. Nothing in this document constitutes an
  earnings representation or supports one.

## 8. Planned Enhancement (v3 — NOT YET IMPLEMENTED): Drive-Time Territory Boundaries

**Status: fully specified except one deferred, non-blocking parameter. Nothing
in this section is live in `lib/addressable-market-constants.ts` or any
deployed code. Do not treat any figure here as computed or as a QA anchor.**

### 8.1 Objective
Territories should be as **small as possible while remaining commercially
defensible** — small because oversized ZCTA/county-based boundaries overstate
real catchment and understate how many territories the map can actually
support; defensible because the boundary should reflect genuine patient
travel behavior, not an administrative line that's easy to dispute (against a
neighboring licensee or against the exclusivity claim itself).

### 8.2 Mechanism (decided)
**The drive-time isochrone becomes the territory boundary — it replaces
ZCTA/county-based geography entirely.** A territory is defined as the polygon
reachable within a drive-time threshold of the practice location, not by
administrative boundary aggregation. Household counts, income qualification,
and credit eligibility all apply within that polygon rather than within a
ZCTA/county shape.

### 8.3 Sizing Rule (decided — fully specified)

Starting from the practice location, expand the drive-time isochrone outward
in increments until the addressable households inside it — after income and
credit qualification — clear a minimum viable customer count, computed as:
```

Minimum viable customers = CUSTOMERS_NEEDED (62) × 1.5 = 93

```

anchored at the **Conservative penetration rate (0.5%)** — i.e., the
isochrone must contain enough qualified households that 0.5% penetration
produces at least 93 customers. In qualified-household terms, that is a floor
of **18,600 qualified households** (93 ÷ 0.005) within the isochrone. The
smallest radius that clears this threshold is the territory boundary.

**Buffer multiplier: 1.5× — DECIDED, provisional.** Confirmed by Trace as a
starting value, not empirically derived (no v3 territory has sold yet). This
value carries an explicit **recalibration trigger**: revisit after the first
cohort of v3-sized territories has real conversion data, and adjust via PR +
`ops.decision_log` entry if actual patient-acquisition performance under- or
over-shoots the 0.5%-Conservative assumption this buffer is built on.

**Radius bounds:**
- **Maximum: 45 minutes drive time (decided).** No territory boundary may
  expand beyond a 45-minute isochrone regardless of whether the viability
  threshold has been cleared.
- **Minimum: deferred (decided to defer).** No floor set. Not a blocker for
  initial v3 scoping.
- **Unresolved case:** what happens when a candidate territory cannot clear
  the 93-customer threshold even at the 45-minute ceiling (e.g., a
  low-density rural market)? Not yet decided. Likely candidates — "not
  currently sellable as a standalone territory" or "sellable under different
  economics" — are Trace pricing decisions, out of scope for this document.

### 8.4 Overlap Resolution (decided)

**First-territory-sold precedence.** When two practices' dynamically-sized
isochrones would overlap, the **earlier-sold territory's boundary is fixed**
and takes precedence. Any territory drawn or resized after that sale must
have its isochrone expansion **stop at the boundary of the already-sold
territory** rather than expand into contested area — even if that means the
later territory needs a larger drive-time radius (up to the 45-minute
ceiling) to independently clear its own 93-customer threshold within the
remaining, unclaimed area.

*Implementation note (non-binding):* this reads naturally as a
geometry-clipping operation — compute the later territory's isochrone, then
subtract any area already inside a sold territory's boundary before checking
against the viability threshold. Exact GIS/geometry approach is a Coder
scoping question, not a methodology ambiguity.

### 8.5 Remaining Open Parameters

**One item, non-blocking:**
- **Minimum radius floor** — explicitly deferred; not required to begin v3
  scoping or implementation.

Mechanism, sizing-rule structure, buffer multiplier, penetration-rate anchor,
maximum radius, and overlap resolution are all decided. **This methodology is
now complete enough to support a Coder scoping session for v3, pending
Trace's explicit go-ahead to open that work** — separate from this docs-only
PR.

### 8.6 Implementation Notes (non-binding)
`NEXT_PUBLIC_MAPBOX_TOKEN` is already provisioned and live on Netlify;
Mapbox's platform includes isochrone/routing capabilities that are a
plausible fit for computing drive-time polygons — to be confirmed and scoped
by Coder, not assumed here as a locked vendor decision.

### 8.7 Consequences for This Document
Once implemented, this is a **formula version bump (v2 → v3)**, not a patch:
- The §5 QA anchors (ZCTA-based: national 69.6M/56.3M, Marin 64,194) are
  **v2-only** and will not reproduce once the boundary definition changes.
  They are retained in §5 as the historical/legacy check for the ZCTA-based
  stage, not as ongoing regression targets once v3 ships.
- New v3 QA anchors **have now been established and locked** via a dedicated
  `ops.decision_log` entry — see §8.8. (This section previously stated they
  "must be established once v3 is implemented"; that step is done.)

### 8.8 v3 QA Anchors — Drive-Time Geography (established, decision #94)

The v3 drive-time sizing engine is implemented (PR #75), runs asynchronously
in production (PR #78/#79), and its QA anchors are now **locked** under
decision **#94**. Three reference territories were sized at a **15-minute**
drive-time isochrone and each reproduced **exactly across two independent
production runs** before being locked:

| Territory | 15-min addressable (VIABLE) |
|---|---|
| Austin – Westlake | **59,699.47** |
| Dallas – Preston Hollow | **120,318.47** |
| Nashville – Green Hills | **33,969.31** |

Full detail (job IDs and the 15/25/35/45-minute probe sets) lives in decision
**#94**; decision #94 is authoritative for these figures.

**These are point-in-time reference values, NOT strict pass/fail regression
targets.** This distinction is methodological, not merely operational, and a
future reader must not treat these anchors as infallible. The reason: unlike
the §5 v2 anchors (which derive from static ZCTA/county geography), the v3
isochrone polygon is fetched **live from Mapbox on every job** and is not
frozen or cached at lock time. A future Mapbox road-graph change can move the
15-minute boundary — and therefore the addressable figure — **without any
change to this platform's code or formula**. Consequently, a deviation from
these anchors **requires investigation before it may be treated as a code
regression**: first rule out isochrone/road-graph drift, then look for a code
cause. Freezing/caching the isochrone geometry at lock time (which would make
these hard regression targets) has been proposed but is **not built** as of
this writing; until it is, treat these three figures as calibrated reference
points, not invariants.

**§5 (the v2 ZCTA anchors) is unaffected by this section** and remains the
legacy regression check for the ZCTA-based stage.

## 9. Change Control

Any change to formula terms, thresholds, sources, or QA anchors requires:
Trace direction → PR against constants/code + this document →
`ops.decision_log` entry via the sanctioned Chat write path. Append-only,
supersede-never-delete.
