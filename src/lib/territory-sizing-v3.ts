/**
 * v3 drive-time sizing engine — expansion algorithm + typed viability outcome.
 *
 * Implements docs/TERRITORY-METHODOLOGY.md §8.3 and docs/V3-DRIVE-TIME-SCOPING.md
 * §3.1: expand the drive-time isochrone from the practice location until the
 * addressable (income- + credit-qualified) households inside it — after sold-area
 * clipping (§4.1) — clear V3_MIN_ADDRESSABLE_FLOOR (18,600), using the smallest
 * drive-time that clears it, capped at V3_MAX_DRIVE_MINUTES (45). If even 45 minutes
 * falls short, the engine returns the typed UNRESOLVED_BELOW_THRESHOLD_AT_CEILING
 * outcome carrying the best-achieved number — it NEVER emits a 45-minute boundary as
 * if it were viable (§5).
 *
 * The addressable arithmetic reuses the UNCHANGED v2 functions incomeQualifiedShare()
 * and addressableHouseholds(); only the credit share is generalized to the multi-state
 * household-weighted blend (flag #4). The expansion search is a pure function over an
 * injected `evaluate(minutes[])` callback, so it is fully fixture-testable without any
 * Mapbox/Census call.
 */

import {
  INCOME_QUALIFY_THRESHOLD_ANNUAL,
  V3_MIN_ADDRESSABLE_FLOOR,
  V3_MAX_DRIVE_MINUTES,
} from '../../lib/addressable-market-constants'
import { incomeQualifiedShare } from './income-screen'
import { addressableHouseholds } from './addressable'
import { blendCreditShareByHouseholds, type ExperianCreditShareFile } from './credit-share'
import { fetchB19001ForPolygon, type ApportionmentDeps, type PolygonApportionment } from './polygon-apportionment'
import type { PolygonalGeometry } from './geometry'
import type { IsochroneCenter, IsochroneContour } from './isochrone'

// ─────────────────────────────────────────────────────────────────────────────
// Addressable for a polygon apportionment (reuses v2 arithmetic + multi-state blend)
// ─────────────────────────────────────────────────────────────────────────────

export interface PolygonAddressableDetail {
  /** Total apportioned households inside the (clipped) polygon. */
  households: number
  /** Income-qualified share from the synthetic B19001 histogram (v2 incomeQualifiedShare). */
  incomeShare: number
  /** Household-weighted, multi-state-blended credit-eligible share (flag #4). */
  creditShare: number
  /** Addressable households = households × incomeShare × creditShare (unrounded). */
  addressable: number
}

/**
 * v3 addressable for a polygon apportionment. Mirrors computeAddressableDetail() but
 * over the synthetic polygon histogram + the multi-state credit blend. income + the
 * multiply are the exact v2 functions — no formula change, only the geography source.
 */
export function computeAddressableForPolygon(
  apportionment: PolygonApportionment,
  creditTable: Pick<ExperianCreditShareFile, 'states'>,
  incomeThreshold: number = INCOME_QUALIFY_THRESHOLD_ANNUAL,
): PolygonAddressableDetail {
  const households = apportionment.totalHouseholds
  const incomeShare = incomeQualifiedShare(apportionment.histogram, incomeThreshold)
  const creditShare = blendCreditShareByHouseholds(apportionment.stateHouseholds, creditTable)
  const addressable = addressableHouseholds(households, incomeShare, creditShare)
  return { households, incomeShare, creditShare, addressable }
}

// ─────────────────────────────────────────────────────────────────────────────
// Expansion search (§3.1) — pure over an injected evaluator
// ─────────────────────────────────────────────────────────────────────────────

/** Terminal viability status for a v3 sizing attempt. */
export const V3SizingStatus = {
  VIABLE: 'VIABLE',
  UNRESOLVED_BELOW_THRESHOLD_AT_CEILING: 'UNRESOLVED_BELOW_THRESHOLD_AT_CEILING',
} as const
export type V3SizingStatus = (typeof V3SizingStatus)[keyof typeof V3SizingStatus]

/** Addressable measured at one candidate drive-time. */
export interface MinuteAddressable {
  minutes: number
  addressable: number
}

export type V3SizingResult =
  | {
      status: 'VIABLE'
      /** Smallest drive-time (integer minutes, ≤ 45) whose addressable clears the floor. */
      minutes: number
      /** Addressable households at `minutes` (≥ floor). */
      addressable: number
      /** Every (minute → addressable) pair probed, in evaluation order (provenance). */
      probes: MinuteAddressable[]
    }
  | {
      status: 'UNRESOLVED_BELOW_THRESHOLD_AT_CEILING'
      /** Best (largest-addressable) drive-time reached, always ≤ 45. */
      bestMinutes: number
      /** Best addressable achieved (< floor) — carried for the Trace pricing decision (§5). */
      bestAddressable: number
      probes: MinuteAddressable[]
    }

export interface ExpansionConfig {
  /**
   * Evaluate addressable for a set of candidate minutes in as few Mapbox requests as
   * possible (the real impl batches up to 4 contours per isochrone request, §3.1).
   * Must return one entry per requested minute.
   */
  evaluate: (minutes: number[]) => Promise<MinuteAddressable[]>
  /** Addressable floor to clear. Defaults to V3_MIN_ADDRESSABLE_FLOOR (18,600). */
  floor?: number
  /** Coarse probe contours (§3.1). Defaults to [15, 25, 35, 45] (4 = Mapbox max/request). */
  probeMinutes?: number[]
  /** Hard ceiling. Defaults to V3_MAX_DRIVE_MINUTES (45). Never exceeded. */
  maxMinutes?: number
}

const DEFAULT_PROBES = [15, 25, 35, 45]

/**
 * Coarse-to-fine expansion search (§3.1). Returns the smallest integer-minute
 * drive-time whose (clipped) addressable clears the floor, or a typed UNRESOLVED
 * result carrying the best achieved when even the ceiling falls short.
 *
 * Strategy:
 *  1. Coarse probe (one batched evaluate over probeMinutes, all ≤ maxMinutes).
 *  2. If some probe clears the floor, binary-refine the (lastFail, firstPass] gap to
 *     the smallest passing integer minute — batched, ≤4 contours per refine request.
 *  3. If no probe clears the floor even at the ceiling → UNRESOLVED with the best number.
 *
 * Monotonicity assumption: addressable is non-decreasing in drive-time (a larger
 * isochrone contains the smaller one). Clipping is fixed per candidate, so this holds
 * within a single sizing. The search is robust to minor non-monotonicity because it
 * always reports the smallest minute observed to clear the floor.
 */
export async function sizeByExpansion(config: ExpansionConfig): Promise<V3SizingResult> {
  const floor = config.floor ?? V3_MIN_ADDRESSABLE_FLOOR
  const maxMinutes = config.maxMinutes ?? V3_MAX_DRIVE_MINUTES
  const probeMinutes = (config.probeMinutes ?? DEFAULT_PROBES)
    .filter((m) => Number.isFinite(m) && m > 0 && m <= maxMinutes)
    .sort((a, b) => a - b)

  if (probeMinutes.length === 0) {
    throw new Error('sizeByExpansion: no valid probe minutes ≤ maxMinutes')
  }

  const probes: MinuteAddressable[] = []
  const seen = new Map<number, number>() // minute → addressable, dedupe evaluate calls

  const evaluateMinutes = async (minutes: number[]): Promise<void> => {
    const todo = minutes.filter((m) => !seen.has(m))
    if (todo.length === 0) return
    const results = await config.evaluate(todo)
    for (const r of results) {
      seen.set(r.minutes, r.addressable)
      probes.push(r)
    }
  }

  // 1. Coarse probe.
  await evaluateMinutes(probeMinutes)

  const clears = (m: number): boolean => (seen.get(m) ?? -Infinity) >= floor

  // Smallest probe that clears the floor.
  const firstPassingProbe = probeMinutes.find(clears)

  if (firstPassingProbe === undefined) {
    // Nothing cleared, even the ceiling probe → UNRESOLVED with the best achieved.
    return unresolved(probes)
  }

  // 2. Binary-refine (lastFail, firstPass] to the smallest passing integer minute.
  // Only refine into a gap bounded BELOW by an actually-failing probe. If the smallest
  // probe already clears, there is nothing smaller to try — §3.1 starts the search at
  // the smallest probe contour and enforces no floor below it (min radius deferred).
  const failingBelow = probeMinutes.filter((m) => m < firstPassingProbe && !clears(m))
  if (failingBelow.length === 0) {
    return {
      status: V3SizingStatus.VIABLE,
      minutes: firstPassingProbe,
      addressable: seen.get(firstPassingProbe) ?? floor,
      probes,
    }
  }

  let lo = Math.max(...failingBelow) // largest known-failing minute below the pass
  let hi = firstPassingProbe // smallest known-passing minute

  while (hi - lo > 1) {
    // Up to 4 evenly-spaced integer candidates strictly inside (lo, hi).
    const span = hi - lo
    const nCandidates = Math.min(4, span - 1)
    const step = span / (nCandidates + 1)
    const candidates: number[] = []
    for (let i = 1; i <= nCandidates; i++) {
      const c = Math.round(lo + step * i)
      if (c > lo && c < hi && !candidates.includes(c)) candidates.push(c)
    }
    if (candidates.length === 0) break

    await evaluateMinutes(candidates)

    // Tighten the bracket from the batch.
    let newLo = lo
    let newHi = hi
    for (const c of candidates) {
      if (clears(c)) {
        if (c < newHi) newHi = c
      } else if (c > newLo) {
        newLo = c
      }
    }
    if (newLo === lo && newHi === hi) break // no movement (shouldn't happen) — stop
    lo = newLo
    hi = newHi
  }

  return {
    status: V3SizingStatus.VIABLE,
    minutes: hi,
    addressable: seen.get(hi) ?? floor,
    probes,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end orchestrator (isochrone → clip → apportion → addressable → expansion)
// ─────────────────────────────────────────────────────────────────────────────

export interface SizeTerritoryDeps {
  /** Batched isochrone fetch (≤4 contours/request). Real impl: fetchIsochroneContours. */
  fetchContours: (center: IsochroneCenter, minutes: number[]) => Promise<IsochroneContour[]>
  /** Block-group data source for polygon apportionment. Real impl: makeCensusTigerDeps(). */
  apportionment: ApportionmentDeps
  /** Experian credit-share table (states map). */
  creditTable: { states: Record<string, number> }
  /** Union of already-sold boundaries to clip out (§4.1). Omit pre-sale. */
  soldUnion?: PolygonalGeometry | null
  /** Income threshold override (defaults to 8% PTI). */
  incomeThreshold?: number
  /** Expansion overrides (probeMinutes / floor / maxMinutes). */
  expansion?: Omit<ExpansionConfig, 'evaluate'>
}

export interface SizeTerritoryOutcome {
  result: V3SizingResult
  /** The isochrone contour at the chosen viable minute (for boundary persistence). Null when UNRESOLVED. */
  sizedContour: IsochroneContour | null
}

/**
 * Size a drive-time territory end-to-end. Composes the injected isochrone fetch, sold
 * clipping, household apportionment, v2 income + multi-state credit qualification, and
 * the coarse-to-fine expansion search. Fully testable with fake deps (no live calls).
 *
 * The `evaluate` passed to sizeByExpansion fetches one batched isochrone request per
 * candidate-minute set (§3.1), then for each contour clips against the sold union and
 * apportions households to an addressable count. Contour polygons are memoized so the
 * final viable minute's polygon can be returned for boundary persistence.
 */
export async function sizeDriveTimeTerritory(
  center: IsochroneCenter,
  deps: SizeTerritoryDeps,
): Promise<SizeTerritoryOutcome> {
  const contourByMinute = new Map<number, IsochroneContour>()

  const evaluate = async (minutes: number[]): Promise<MinuteAddressable[]> => {
    const contours = await deps.fetchContours(center, minutes)
    const out: MinuteAddressable[] = []
    for (const contour of contours) {
      contourByMinute.set(contour.minutes, contour)
      const apportionment = await fetchB19001ForPolygon(
        contour.polygon,
        deps.apportionment,
        deps.soldUnion,
      )
      const detail = computeAddressableForPolygon(apportionment, deps.creditTable, deps.incomeThreshold)
      out.push({ minutes: contour.minutes, addressable: detail.addressable })
    }
    // A requested minute Mapbox did not return is treated as 0 addressable (fail-safe:
    // a missing contour never counts as viable), so the search still terminates.
    for (const m of minutes) {
      if (!contourByMinute.has(m)) out.push({ minutes: m, addressable: 0 })
    }
    return out
  }

  const result = await sizeByExpansion({ evaluate, ...deps.expansion })
  const sizedContour = result.status === 'VIABLE' ? contourByMinute.get(result.minutes) ?? null : null
  return { result, sizedContour }
}

function unresolved(probes: MinuteAddressable[]): V3SizingResult {
  let best: MinuteAddressable = { minutes: 0, addressable: -Infinity }
  for (const p of probes) {
    if (p.addressable > best.addressable) best = p
  }
  return {
    status: V3SizingStatus.UNRESOLVED_BELOW_THRESHOLD_AT_CEILING,
    bestMinutes: best.minutes,
    bestAddressable: Math.max(0, best.addressable),
    probes,
  }
}
