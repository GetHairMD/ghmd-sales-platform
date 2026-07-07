import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  rowToBlockGroup,
  blockGroupToRow,
  freshnessCutoffIso,
  readFreshBlockGroups,
  type BlockGroupCacheRow,
  type BlockGroupWithCentroid,
} from '../census-bg-cache'
import { CENSUS_CACHE_TTL_DAYS } from '../../../lib/addressable-market-constants'

describe('rowToBlockGroup', () => {
  it('coerces a cache row into a typed BlockGroupRecord', () => {
    const row: BlockGroupCacheRow = {
      geoid: '480530011001',
      state_fips: '48',
      centroid_lng: -97.5,
      centroid_lat: 30.2,
      b19001: { B19001_001E: 1000, B19001_017E: 200 },
      blocks: [
        { households: 50, point: [-97.5, 30.2] },
        { households: 25, point: [-97.6, 30.3] },
      ],
    }
    const bg = rowToBlockGroup(row)
    expect(bg).toEqual({
      geoid: '480530011001',
      stateFips: '48',
      b19001: { B19001_001E: 1000, B19001_017E: 200 },
      blocks: [
        { households: 50, point: [-97.5, 30.2] },
        { households: 25, point: [-97.6, 30.3] },
      ],
    })
  })

  it('drops malformed blocks and clamps negative households', () => {
    const row = {
      geoid: '480530011001',
      state_fips: '48',
      centroid_lng: null,
      centroid_lat: null,
      b19001: {},
      blocks: [
        { households: -5, point: [-97.5, 30.2] },
        { households: 10, point: [-97.6] as unknown as [number, number] }, // bad point
      ],
    } as BlockGroupCacheRow
    const bg = rowToBlockGroup(row)
    expect(bg.blocks).toEqual([{ households: 0, point: [-97.5, 30.2] }])
  })
})

describe('blockGroupToRow', () => {
  it('round-trips a block group through row form (centroid split out)', () => {
    const bg: BlockGroupWithCentroid = {
      geoid: '480530011001',
      stateFips: '48',
      b19001: { B19001_001E: 1000 },
      blocks: [{ households: 50, point: [-97.5, 30.2] }],
      centroid: [-97.55, 30.25],
    }
    const row = blockGroupToRow(bg)
    expect(row.centroid_lng).toBe(-97.55)
    expect(row.centroid_lat).toBe(30.25)
    expect(rowToBlockGroup(row)).toEqual({
      geoid: bg.geoid,
      stateFips: bg.stateFips,
      b19001: bg.b19001,
      blocks: bg.blocks,
    })
  })

  it('null centroid → null lng/lat', () => {
    const row = blockGroupToRow({
      geoid: '480530011001',
      stateFips: '48',
      b19001: {},
      blocks: [],
      centroid: null,
    })
    expect(row.centroid_lng).toBeNull()
    expect(row.centroid_lat).toBeNull()
  })
})

describe('freshnessCutoffIso', () => {
  it('is exactly CENSUS_CACHE_TTL_DAYS (90) before now', () => {
    const now = Date.parse('2026-07-07T00:00:00.000Z')
    const cutoff = freshnessCutoffIso(now)
    expect(cutoff).toBe(new Date(now - 90 * 86_400_000).toISOString())
    expect(CENSUS_CACHE_TTL_DAYS).toBe(90)
  })
})

// Minimal fake Supabase client: .from().select().in().gte() resolves to { data }.
function fakeClient(rows: BlockGroupCacheRow[]) {
  const calls: { geoids: string[]; cutoff: string }[] = []
  const client = {
    from() {
      let captured: { geoids: string[]; cutoff: string } = { geoids: [], cutoff: '' }
      const builder = {
        select() {
          return builder
        },
        in(_col: string, geoids: string[]) {
          captured.geoids = geoids
          return builder
        },
        gte(_col: string, cutoff: string) {
          captured.cutoff = cutoff
          calls.push(captured)
          const data = rows.filter(
            (r) => captured.geoids.includes(r.geoid) && (r.fetched_at ?? '') >= cutoff,
          )
          return Promise.resolve({ data, error: null })
        },
      }
      return builder
    },
  }
  return { client, calls }
}

describe('readFreshBlockGroups', () => {
  it('returns only fresh, requested GEOIDs and skips stale ones', async () => {
    const now = Date.parse('2026-07-07T00:00:00.000Z')
    const fresh = new Date(now - 10 * 86_400_000).toISOString()
    const stale = new Date(now - 200 * 86_400_000).toISOString()
    const rows: BlockGroupCacheRow[] = [
      { geoid: '480530011001', state_fips: '48', centroid_lng: null, centroid_lat: null, b19001: { B19001_001E: 100 }, blocks: [], fetched_at: fresh },
      { geoid: '480530011002', state_fips: '48', centroid_lng: null, centroid_lat: null, b19001: {}, blocks: [], fetched_at: stale },
    ]
    const { client } = fakeClient(rows)
    const map = await readFreshBlockGroups(
      client as unknown as SupabaseClient,
      ['480530011001', '480530011002', '999999999999'],
      now,
    )
    expect(Array.from(map.keys())).toEqual(['480530011001'])
    expect(map.get('480530011001')?.b19001).toEqual({ B19001_001E: 100 })
  })
})
