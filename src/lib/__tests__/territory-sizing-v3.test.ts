import { describe, expect, it } from 'vitest'
import {
  computeAddressableForPolygon,
  sizeByExpansion,
  sizeDriveTimeTerritory,
  V3SizingStatus,
  type MinuteAddressable,
} from '../territory-sizing-v3'
import { apportionB19001, type BlockGroupRecord } from '../polygon-apportionment'
import { flatB19001 } from '../__fixtures__/v3-geo'
import type { IsochroneContour } from '../isochrone'
import { creditShareForState } from '../credit-share'
import { V3_MIN_ADDRESSABLE_FLOOR, V3_MIN_DRIVE_MINUTES } from '../../../lib/addressable-market-constants'
import creditTable from '../../../data/experian-credit-share-by-state.json'
import { isoSquare, soldUnion, bgTexasLeft, bgOklahomaStraddle } from '../__fixtures__/v3-geo'

const table = { states: (creditTable as { states: Record<string, number> }).states }

describe('computeAddressableForPolygon (reuses v2 arithmetic + multi-state blend)', () => {
  it('households × incomeShare(=1 for top bracket) × blended credit share', () => {
    // Both block groups fully inside, no clip: 2000 households (TX 1000 / OK 1000).
    const apportionment = apportionB19001([bgTexasLeft, bgOklahomaStraddle], isoSquare)
    const detail = computeAddressableForPolygon(apportionment, table)

    expect(detail.households).toBe(2000)
    expect(detail.incomeShare).toBe(1) // fixtures put all households in $200k+ open bracket
    const expectedCredit =
      0.5 * creditShareForState('TX', table) + 0.5 * creditShareForState('OK', table)
    expect(detail.creditShare).toBeCloseTo(expectedCredit, 12)
    expect(detail.addressable).toBeCloseTo(2000 * expectedCredit, 6)
  })

  it('sold clipping lowers households (and thus addressable)', () => {
    const clipped = apportionB19001([bgTexasLeft, bgOklahomaStraddle], isoSquare, soldUnion)
    const detail = computeAddressableForPolygon(clipped, table)
    expect(detail.households).toBe(1500) // OK straddle half removed
  })
})

// A synthetic monotonic addressable curve for the expansion search: addressable grows
// with drive-time. Each call records which minutes were evaluated (to assert batching).
function makeEvaluator(curve: (m: number) => number) {
  const calls: number[][] = []
  const evaluate = async (minutes: number[]): Promise<MinuteAddressable[]> => {
    calls.push([...minutes])
    return minutes.map((m) => ({ minutes: m, addressable: curve(m) }))
  }
  return { evaluate, calls }
}

describe('sizeByExpansion (§3.1 coarse-to-fine, §5 UNRESOLVED)', () => {
  it('returns the smallest passing PROBE minute when a probe boundary is exact', async () => {
    // Clears exactly at 35 (probe), fails at 25. Floor default 18,600.
    const { evaluate } = makeEvaluator((m) => (m >= 35 ? 20_000 : 5_000))
    const r = await sizeByExpansion({ evaluate })
    expect(r.status).toBe(V3SizingStatus.VIABLE)
    if (r.status === 'VIABLE') expect(r.minutes).toBe(35)
  })

  it('binary-refines the gap to the smallest passing integer minute', async () => {
    // Threshold crossing at 28: fails ≤27, clears ≥28. Probes 15/25 fail, 35/45 pass.
    const { evaluate, calls } = makeEvaluator((m) => (m >= 28 ? 19_000 : 1_000))
    const r = await sizeByExpansion({ evaluate })
    expect(r.status).toBe(V3SizingStatus.VIABLE)
    if (r.status === 'VIABLE') expect(r.minutes).toBe(28)
    // First evaluate call is the 4-contour coarse probe.
    expect(calls[0]).toEqual([15, 25, 35, 45])
    // Refinement stays within (25, 35].
    for (const batch of calls.slice(1)) {
      for (const m of batch) expect(m).toBeGreaterThan(25), expect(m).toBeLessThanOrEqual(35)
    }
  })

  it('refines BELOW the smallest probe to the smallest qualifying minute (m* < 15)', async () => {
    // Dense metro: clears at 8, fails ≤7. The smallest probe (15) already clears, so the
    // search must continue downward rather than stopping at 15 (no 15-min floor).
    const { evaluate } = makeEvaluator((m) => (m >= 8 ? 20_000 : 1_000))
    const r = await sizeByExpansion({ evaluate })
    expect(r.status).toBe(V3SizingStatus.VIABLE)
    if (r.status === 'VIABLE') {
      expect(r.minutes).toBe(8)
      expect(r.addressable).toBeGreaterThanOrEqual(V3_MIN_ADDRESSABLE_FLOOR)
    }
  })

  it('clamps to the 5-minute floor when the addressable floor clears even at 1 minute', async () => {
    // Pre-#120 this returned minute 1; decision #120 sets V3_MIN_DRIVE_MINUTES = 5 as the
    // hard minimum boundary, so an m* of 1 is clamped up to 5 (see the dedicated clamp
    // suite below for the addressable/provenance assertions).
    const { evaluate } = makeEvaluator(() => 50_000) // clears everywhere, including m = 1
    const r = await sizeByExpansion({ evaluate })
    expect(r.status).toBe(V3SizingStatus.VIABLE)
    if (r.status === 'VIABLE') expect(r.minutes).toBe(V3_MIN_DRIVE_MINUTES)
  })

  it('keeps downward refinement batched ≤4 and strictly below the smallest probe', async () => {
    const { evaluate, calls } = makeEvaluator((m) => (m >= 8 ? 20_000 : 1_000))
    await sizeByExpansion({ evaluate })
    expect(calls[0]).toEqual([15, 25, 35, 45]) // coarse probe first
    for (const batch of calls.slice(1)) {
      expect(batch.length).toBeLessThanOrEqual(4)
      for (const m of batch) {
        expect(m).toBeGreaterThanOrEqual(1)
        expect(m).toBeLessThan(15)
      }
    }
  })

  it('returns the smallest probe (15) when nothing below it clears', async () => {
    // Monotonic curve: only ≥ 15 clears. The downward search finds nothing smaller and
    // reports 15 — the smallest probe is a valid m* when it is genuinely the minimum.
    const { evaluate } = makeEvaluator((m) => (m >= 15 ? 20_000 : 1_000))
    const r = await sizeByExpansion({ evaluate })
    expect(r.status).toBe(V3SizingStatus.VIABLE)
    if (r.status === 'VIABLE') expect(r.minutes).toBe(15)
  })

  it('never clears even at the 45-min ceiling → UNRESOLVED with best achieved', async () => {
    const { evaluate } = makeEvaluator((m) => m * 100) // max at 45 → 4,500 < 18,600
    const r = await sizeByExpansion({ evaluate })
    expect(r.status).toBe(V3SizingStatus.UNRESOLVED_BELOW_THRESHOLD_AT_CEILING)
    if (r.status === 'UNRESOLVED_BELOW_THRESHOLD_AT_CEILING') {
      expect(r.bestMinutes).toBe(45)
      expect(r.bestAddressable).toBe(4_500)
    }
  })

  it('never proposes a boundary beyond the 45-min ceiling', async () => {
    const { evaluate } = makeEvaluator((m) => (m >= 45 ? 30_000 : 1_000))
    const r = await sizeByExpansion({ evaluate })
    expect(r.status).toBe(V3SizingStatus.VIABLE)
    if (r.status === 'VIABLE') expect(r.minutes).toBeLessThanOrEqual(45)
  })

  it('respects a custom floor', async () => {
    const { evaluate } = makeEvaluator((m) => m * 1_000) // 15→15k ... 45→45k
    const r = await sizeByExpansion({ evaluate, floor: 40_000 })
    expect(r.status).toBe(V3SizingStatus.VIABLE)
    if (r.status === 'VIABLE') expect(r.addressable).toBeGreaterThanOrEqual(40_000)
  })

  it('uses V3_MIN_ADDRESSABLE_FLOOR (18,600) as the default floor', async () => {
    const justUnder = makeEvaluator(() => V3_MIN_ADDRESSABLE_FLOOR - 1)
    expect((await sizeByExpansion(justUnder)).status).toBe(
      V3SizingStatus.UNRESOLVED_BELOW_THRESHOLD_AT_CEILING,
    )
    const justAt = makeEvaluator(() => V3_MIN_ADDRESSABLE_FLOOR)
    expect((await sizeByExpansion(justAt)).status).toBe(V3SizingStatus.VIABLE)
  })
})

describe('sizeByExpansion — V3_MIN_DRIVE_MINUTES floor clamp (§8.5, decision #120)', () => {
  it('clamps a sub-floor m* (=2) up to 5 minutes with the 5-minute addressable', async () => {
    // Monotonic curve clearing 18,600 at m ≥ 2 (m=1 → 10k fails, m=2 → 20k passes).
    const { evaluate } = makeEvaluator((m) => m * 10_000)
    const r = await sizeByExpansion({ evaluate })
    expect(r.status).toBe(V3SizingStatus.VIABLE)
    if (r.status === 'VIABLE') {
      // Returned boundary is the 5-min floor, not the technically-sufficient 2 minutes.
      expect(r.minutes).toBe(V3_MIN_DRIVE_MINUTES)
      // Addressable reflects the 5-minute evaluation (50k), not the 2-minute one (20k).
      expect(r.addressable).toBe(50_000)
      expect(r.addressable).not.toBe(20_000)
      // Provenance: the floor-driven 5-minute evaluation appears in the probes.
      expect(r.probes.some((p) => p.minutes === V3_MIN_DRIVE_MINUTES)).toBe(true)
    }
  })

  it('returns 5 with no duplicate evaluation when m* is exactly 5', async () => {
    // Clears at m ≥ 5 (m=4 → 16k fails, m=5 → 20k passes); the refine loop lands on 5.
    const { evaluate, calls } = makeEvaluator((m) => m * 4_000)
    const r = await sizeByExpansion({ evaluate })
    expect(r.status).toBe(V3SizingStatus.VIABLE)
    if (r.status === 'VIABLE') {
      expect(r.minutes).toBe(5)
      expect(r.addressable).toBe(20_000)
    }
    // 5 was already in `seen` from the refine loop — the clamp must not re-evaluate it.
    expect(calls.flat().filter((m) => m === 5)).toHaveLength(1)
  })

  it('leaves an m* at or above the floor (=8) unaffected', async () => {
    // Clears at m ≥ 8 (m=7 → 16.8k fails, m=8 → 19.2k passes). No clamp.
    const { evaluate, calls } = makeEvaluator((m) => m * 2_400)
    const r = await sizeByExpansion({ evaluate })
    expect(r.status).toBe(V3SizingStatus.VIABLE)
    if (r.status === 'VIABLE') expect(r.minutes).toBe(8)
    // The clamp is inert: 5 minutes is never evaluated.
    expect(calls.flat()).not.toContain(5)
  })
})

// ── End-to-end orchestrator (fake isochrone + fake census, no live calls) ────────
//
// Fake isochrone: a square [0,0]–[s,s] with side s = minute/5, so a larger minute
// contains more of the block group's blocks (points [k,k], k=1..9, 5,000 households
// each, all Texas, all $200k+ so income share = 1). addressable grows with minute.
const CREDIT_TX = 0.717 // rough; the test asserts thresholds, not this exact value

function squareContour(minutes: number): IsochroneContour {
  const s = minutes / 5
  return {
    minutes,
    polygon: {
      type: 'Feature',
      properties: { contour: minutes },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [s, 0], [s, s], [0, s], [0, 0]]],
      },
    },
  }
}

const nineBlockBG: BlockGroupRecord = {
  geoid: '480010001001',
  stateFips: '48',
  b19001: flatB19001(45_000), // 9 blocks × 5,000
  blocks: Array.from({ length: 9 }, (_, i) => ({ households: 5_000, point: [i + 1, i + 1] as [number, number] })),
}

const fakeDeps = {
  fetchContours: async (_c: { lat: number; lng: number }, minutes: number[]) =>
    minutes.map(squareContour),
  apportionment: { fetchIntersectingBlockGroups: async () => [nineBlockBG] },
  creditTable: { states: { TX: CREDIT_TX } },
}

describe('sizeDriveTimeTerritory (isochrone → clip → apportion → addressable → expansion)', () => {
  it('sizes to the smallest viable minute and returns that contour', async () => {
    const { result, sizedContour } = await sizeDriveTimeTerritory({ lat: 30, lng: -97 }, fakeDeps)
    expect(result.status).toBe(V3SizingStatus.VIABLE)
    if (result.status === 'VIABLE') {
      // crossing 18,600 needs ≥ 6 blocks (6×5000×0.717 = 21,510) → side ≥ 6 → minute ≥ 30
      expect(result.minutes).toBe(30)
      expect(result.addressable).toBeGreaterThanOrEqual(18_600)
    }
    expect(sizedContour?.minutes).toBe(30)
  })

  it('clamps to the 5-minute floor AND returns the 5-minute contour (boundary persistence)', async () => {
    // Dense metro: a single block with enough households to clear the floor inside even the
    // smallest isochrone (block at [0.1,0.1] sits inside squareContour(1), side 0.2). So
    // m* would be 1; the clamp must both report minutes = 5 and fetch the 5-min contour so
    // boundary persistence has a real polygon (not the sub-floor one, not null).
    const denseBG: BlockGroupRecord = {
      geoid: '480010001002',
      stateFips: '48',
      b19001: flatB19001(40_000), // all households in the $200k+ open bracket → income share 1
      blocks: [{ households: 40_000, point: [0.1, 0.1] }],
    }
    const denseDeps = {
      fetchContours: async (_c: { lat: number; lng: number }, minutes: number[]) =>
        minutes.map(squareContour),
      apportionment: { fetchIntersectingBlockGroups: async () => [denseBG] },
      creditTable: { states: { TX: CREDIT_TX } },
    }
    const { result, sizedContour } = await sizeDriveTimeTerritory({ lat: 30, lng: -97 }, denseDeps)
    expect(result.status).toBe(V3SizingStatus.VIABLE)
    if (result.status === 'VIABLE') {
      expect(result.minutes).toBe(V3_MIN_DRIVE_MINUTES)
      expect(result.addressable).toBeGreaterThanOrEqual(V3_MIN_ADDRESSABLE_FLOOR)
    }
    expect(sizedContour?.minutes).toBe(V3_MIN_DRIVE_MINUTES) // the clamp fetched the 5-min contour
  })

  it('sold clipping can push a candidate to UNRESOLVED at the ceiling', async () => {
    // Sold union removes every block at lng ≥ 5, leaving only 4 blocks (20,000 hh →
    // 14,340 addressable) even at the 45-min ceiling.
    const soldUnion: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [[[5, 0], [15, 0], [15, 15], [5, 15], [5, 0]]] },
        },
      ],
    }
    const { result, sizedContour } = await sizeDriveTimeTerritory(
      { lat: 30, lng: -97 },
      { ...fakeDeps, soldUnion },
    )
    expect(result.status).toBe(V3SizingStatus.UNRESOLVED_BELOW_THRESHOLD_AT_CEILING)
    expect(sizedContour).toBeNull()
    if (result.status === 'UNRESOLVED_BELOW_THRESHOLD_AT_CEILING') {
      expect(result.bestAddressable).toBeLessThan(18_600)
      expect(result.bestMinutes).toBeLessThanOrEqual(45)
    }
  })
})
