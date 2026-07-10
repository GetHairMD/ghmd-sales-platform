/**
 * v3 QA-anchor freeze — addressable-arithmetic regression (decision #96; figures per #127).
 *
 * WHAT THIS GUARDS. For each of the three §8.8 anchors it feeds a FROZEN Mapbox isochrone
 * (the winning contour the #127 job produced) plus FROZEN census block groups (the rows that
 * produced that job's figure) straight into the real pure pipeline
 * (apportionB19001 → computeAddressableForPolygon) and asserts the addressable figure
 * reproduces exactly. Because both geo inputs are frozen, a deviation here is UNAMBIGUOUSLY a
 * code regression in the addressable computation — never Mapbox road-graph drift. This is the
 * "rule out drift, then look for a code cause" discipline of §8.8, made mechanical.
 *
 * SCOPE — READ THIS. It validates the addressable arithmetic at each anchor's LOCKED WINNING
 * MINUTE. It does NOT exercise the expansion / minute-selection search: that would require
 * every probed contour (15/25/35/45 + refinements), and the job persists only the winning
 * contour. So "the freeze shipped" does NOT mean the whole v3 engine is regression-tested
 * end-to-end — the minute-selection search remains covered only by the synthetic-curve unit
 * tests in territory-sizing-v3.test.ts.
 *
 * NO NETWORK. The frozen polygon is fed to the pure functions directly — no isochrone fetch,
 * so the suite needs no MAPBOX_SERVER_TOKEN and makes no live Mapbox/Census call.
 */

import { describe, it, expect } from 'vitest'
import { apportionB19001 } from '../polygon-apportionment'
import { computeAddressableForPolygon } from '../territory-sizing-v3'
import { V3_QA_ANCHORS } from '../__fixtures__/v3-qa-anchors'
import creditTable from '../../../data/experian-credit-share-by-state.json'

const table = { states: (creditTable as { states: Record<string, number> }).states }

describe('v3 QA anchor freeze — addressable-arithmetic regression (decision #96; figures per #127)', () => {
  it('freezes exactly the three §8.8 anchors', () => {
    expect(V3_QA_ANCHORS.map((a) => a.slug).sort()).toEqual([
      'austin-westlake',
      'dallas-preston-hollow',
      'nashville-green-hills',
    ])
  })

  for (const anchor of V3_QA_ANCHORS) {
    describe(anchor.name, () => {
      // soldUnion = null: all three #127 anchor jobs ran with soldClipped = false.
      const apportionment = apportionB19001(anchor.blockGroups, anchor.winningContour.polygon, null)
      const detail = computeAddressableForPolygon(apportionment, table)

      it(`reproduces the frozen addressable EXACTLY at the locked ${anchor.minutes}-min contour`, () => {
        // Exact float equality — no tolerance. A frozen input must reproduce a frozen output;
        // any deviation is a code regression in the addressable arithmetic.
        expect(detail.addressable).toBe(anchor.expectedAddressable)
      })

      it('ties to the decision #127 / §8.8 published figure (2-dp)', () => {
        expect(Math.round(detail.addressable * 100) / 100).toBe(anchor.publishedAddressable)
      })

      it('freezes the winning contour at the locked minute', () => {
        expect(anchor.winningContour.minutes).toBe(anchor.minutes)
      })
    })
  }
})
