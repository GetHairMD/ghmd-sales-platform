/**
 * Polygon → synthetic B19001 histogram apportionment (v3, §3.2).
 *
 * Replaces the polygon-shaped gap that fetchB19001ForCounty() (census.ts) and
 * fetchB19001ForZcta() (income-screen.ts) do not cover: the Census API only serves
 * income histograms for standard geographies (county / ZCTA / tract / block group),
 * never for an arbitrary drive-time isochrone. This module intersects the isochrone
 * with block groups and apportions each B19001 bracket by the HOUSEHOLD-WEIGHTED
 * fraction of the block group inside the (optionally sold-clipped) isochrone
 * (resolved decision #89 flag #3 — population/household-weighted, not areal), then
 * sums into one synthetic B19001 histogram for the polygon.
 *
 * That synthetic histogram plugs straight into the UNCHANGED v2 arithmetic —
 * incomeQualifiedShare() / bracketQualifyingFraction() / addressableHouseholds() —
 * exactly as the scoping doc §3.3 describes. This module adds the geography-specific
 * layer only; it changes no v2 output.
 *
 * The pure core (apportionB19001) is fixture-testable with no network. The live
 * fetch orchestrator (fetchB19001ForPolygon) takes injectable data-source deps so it
 * is testable with fakes and wires to real Census/TIGERweb adapters at runtime.
 */

import { B19001_INCOME_BRACKETS, B19001_TOTAL_HH_VAR } from '../../lib/addressable-market-constants'
import { abbrForStateFips } from './state-fips'
import { pointInClippedArea, type PolygonalGeometry, type Position } from './geometry'

/** One census block: a household count and a representative point (dasymetric weight unit). */
export interface BlockRecord {
  /** Households in this block (2020 Census H1 / equivalent decennial denominator). */
  households: number
  /** Representative interior point [lng, lat] used for point-in-polygon attribution. */
  point: Position
}

/** One block group intersecting the isochrone, with its income histogram and blocks. */
export interface BlockGroupRecord {
  /** 12-digit block-group GEOID (state+county+tract+bg). */
  geoid: string
  /** 2-digit state FIPS (drives the credit-share state key). */
  stateFips: string
  /** ACS B19001 variable → household count for the whole block group. */
  b19001: Record<string, number>
  /** Constituent census blocks with household denominators + points. */
  blocks: BlockRecord[]
}

/** Household-weight (0–1) of a block group inside the clipped isochrone. */
export interface BlockGroupWeight {
  geoid: string
  stateFips: string
  /** Fraction of the block group's households inside the clipped isochrone, [0,1]. */
  weight: number
  /** Absolute apportioned households inside the clipped isochrone for this block group. */
  householdsInside: number
}

/**
 * Household-weighted fraction of a block group inside the clipped isochrone.
 * weight = Σ households of blocks whose point ∈ (isochrone \ sold) / Σ all block households.
 * Falls back to 0 when the block group reports no household denominator.
 */
export function householdWeightForBlockGroup(
  bg: BlockGroupRecord,
  isochrone: PolygonalGeometry,
  soldUnion?: PolygonalGeometry | null,
): BlockGroupWeight {
  let totalHH = 0
  let insideHH = 0
  for (const block of bg.blocks) {
    const hh = Math.max(0, block.households)
    totalHH += hh
    if (hh > 0 && pointInClippedArea(block.point, isochrone, soldUnion)) {
      insideHH += hh
    }
  }
  const weight = totalHH > 0 ? insideHH / totalHH : 0
  return { geoid: bg.geoid, stateFips: bg.stateFips, weight, householdsInside: insideHH }
}

/** Synthetic B19001 histogram for a polygon, plus per-state household totals. */
export interface PolygonApportionment {
  /** Synthetic B19001 variable → apportioned household count (incl. B19001_001E total). */
  histogram: Record<string, number>
  /** 2-letter USPS state code → apportioned households inside the polygon (credit blend). */
  stateHouseholds: Record<string, number>
  /** Total apportioned households inside the polygon (Σ of stateHouseholds). */
  totalHouseholds: number
  /** Per-block-group weights (audit trail / provenance). */
  weights: BlockGroupWeight[]
}

/** All B19001 variables apportioned (total + every income bracket). */
const B19001_ALL_VARS: string[] = [B19001_TOTAL_HH_VAR, ...B19001_INCOME_BRACKETS.map((b) => b.variable)]

/**
 * PURE CORE. Apportion a set of intersecting block groups into one synthetic B19001
 * histogram for the polygon, household-weighted and sold-clipped. No network.
 *
 * Each block group contributes `weight × bracketCount` to every B19001 variable, where
 * `weight` is its household-weighted inside-fraction. Per-state household totals are
 * accumulated from the apportioned B19001_001E totals for the multi-state credit blend.
 */
export function apportionB19001(
  blockGroups: BlockGroupRecord[],
  isochrone: PolygonalGeometry,
  soldUnion?: PolygonalGeometry | null,
): PolygonApportionment {
  const histogram: Record<string, number> = {}
  for (const v of B19001_ALL_VARS) histogram[v] = 0
  const stateHouseholds: Record<string, number> = {}
  const weights: BlockGroupWeight[] = []

  for (const bg of blockGroups) {
    const w = householdWeightForBlockGroup(bg, isochrone, soldUnion)
    weights.push(w)
    if (w.weight <= 0) continue

    for (const v of B19001_ALL_VARS) {
      histogram[v] += (bg.b19001[v] || 0) * w.weight
    }

    // Per-state households use the apportioned B19001 TOTAL (consistent with the
    // histogram), so the credit blend and the income screen see the same denominator.
    const apportionedTotal = (bg.b19001[B19001_TOTAL_HH_VAR] || 0) * w.weight
    const stateAbbr = abbrForStateFips(bg.stateFips) ?? ''
    stateHouseholds[stateAbbr] = (stateHouseholds[stateAbbr] || 0) + apportionedTotal
  }

  const totalHouseholds = Object.values(stateHouseholds).reduce((s, n) => s + n, 0)
  return { histogram, stateHouseholds, totalHouseholds, weights }
}

/**
 * Injectable data sources for the live orchestrator. Real adapters hit Census
 * TIGERweb (block-group + block geometries) and the Census ACS API (B19001); fakes
 * return fixtures in tests. Kept as a dependency bag so fetchB19001ForPolygon is
 * fully unit-testable without live calls (PR-B brief: fixtures, not live Mapbox/Census).
 */
export interface ApportionmentDeps {
  /** Block groups whose geometry intersects the isochrone, with blocks + B19001 loaded. */
  fetchIntersectingBlockGroups: (isochrone: PolygonalGeometry) => Promise<BlockGroupRecord[]>
}

/**
 * ORCHESTRATOR (replacement for fetchB19001ForCounty/fetchB19001ForZcta at the polygon
 * level). Fetches the intersecting block groups via the injected source, then runs the
 * pure apportionment. Returns the synthetic histogram + per-state households ready for
 * incomeQualifiedShare() and the credit blend.
 */
export async function fetchB19001ForPolygon(
  isochrone: PolygonalGeometry,
  deps: ApportionmentDeps,
  soldUnion?: PolygonalGeometry | null,
): Promise<PolygonApportionment> {
  const blockGroups = await deps.fetchIntersectingBlockGroups(isochrone)
  return apportionB19001(blockGroups, isochrone, soldUnion)
}
