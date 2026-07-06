import { describe, expect, it } from 'vitest'
import {
  householdWeightForBlockGroup,
  apportionB19001,
  fetchB19001ForPolygon,
} from '../polygon-apportionment'
import { B19001_TOTAL_HH_VAR } from '../../../lib/addressable-market-constants'
import {
  isoSquare,
  soldUnion,
  bgTexasLeft,
  bgOklahomaStraddle,
  bgNevadaOutside,
} from '../__fixtures__/v3-geo'

describe('householdWeightForBlockGroup (household-weighted, flag #3)', () => {
  it('block group fully inside the unsold iso → weight 1', () => {
    const w = householdWeightForBlockGroup(bgTexasLeft, isoSquare)
    expect(w.weight).toBe(1)
    expect(w.householdsInside).toBe(1000)
  })

  it('straddling block group, no clip → both blocks inside iso → weight 1', () => {
    const w = householdWeightForBlockGroup(bgOklahomaStraddle, isoSquare)
    expect(w.weight).toBe(1)
    expect(w.householdsInside).toBe(1000)
  })

  it('straddling block group WITH sold clip → only the unsold half counts → weight 0.5', () => {
    const w = householdWeightForBlockGroup(bgOklahomaStraddle, isoSquare, soldUnion)
    expect(w.weight).toBe(0.5)
    expect(w.householdsInside).toBe(500)
  })

  it('block group entirely outside the iso → weight 0', () => {
    const w = householdWeightForBlockGroup(bgNevadaOutside, isoSquare)
    expect(w.weight).toBe(0)
    expect(w.householdsInside).toBe(0)
  })
})

describe('apportionB19001 (synthetic polygon histogram)', () => {
  const bgs = [bgTexasLeft, bgOklahomaStraddle, bgNevadaOutside]

  it('household-weights each bracket and sums across block groups (no clip)', () => {
    const a = apportionB19001(bgs, isoSquare)
    // TX(1000×1) + OK(1000×1) + NV(1000×0) = 2000 total
    expect(a.histogram[B19001_TOTAL_HH_VAR]).toBe(2000)
    expect(a.totalHouseholds).toBe(2000)
    expect(a.stateHouseholds).toEqual({ TX: 1000, OK: 1000 })
  })

  it('applies sold clipping before apportioning (§4.1)', () => {
    const a = apportionB19001(bgs, isoSquare, soldUnion)
    // TX(1000×1) + OK(1000×0.5) + NV(0) = 1500
    expect(a.histogram[B19001_TOTAL_HH_VAR]).toBe(1500)
    expect(a.totalHouseholds).toBe(1500)
    expect(a.stateHouseholds).toEqual({ TX: 1000, OK: 500 })
  })

  it('records a weight entry per block group for provenance', () => {
    const a = apportionB19001(bgs, isoSquare, soldUnion)
    expect(a.weights.map((w) => w.geoid)).toEqual([
      bgTexasLeft.geoid,
      bgOklahomaStraddle.geoid,
      bgNevadaOutside.geoid,
    ])
    expect(a.weights.map((w) => w.weight)).toEqual([1, 0.5, 0])
  })

  it('empty block-group set → zeroed histogram, no states', () => {
    const a = apportionB19001([], isoSquare)
    expect(a.totalHouseholds).toBe(0)
    expect(a.stateHouseholds).toEqual({})
    expect(a.histogram[B19001_TOTAL_HH_VAR]).toBe(0)
  })
})

describe('fetchB19001ForPolygon (orchestrator with injectable deps)', () => {
  it('fetches intersecting block groups then apportions', async () => {
    const deps = {
      fetchIntersectingBlockGroups: async () => [bgTexasLeft, bgOklahomaStraddle, bgNevadaOutside],
    }
    const a = await fetchB19001ForPolygon(isoSquare, deps, soldUnion)
    expect(a.totalHouseholds).toBe(1500)
    expect(a.stateHouseholds).toEqual({ TX: 1000, OK: 500 })
  })
})
