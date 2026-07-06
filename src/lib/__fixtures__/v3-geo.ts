/**
 * Deterministic GeoJSON + census fixtures for v3 sizing engine unit tests.
 *
 * Per docs/V3-DRIVE-TIME-SCOPING.md §6 and the PR-B brief: geometry/polygon logic is
 * tested against PINNED fixture GeoJSON, never live Mapbox/Census calls, so results are
 * reproducible and offline. Coordinates are abstract WGS84-shaped [lng, lat] squares —
 * point-in-polygon containment is topological, so exact geography is irrelevant here.
 *
 * Layout (lng × lat):
 *   isoSquare      : the "isochrone"          → lng [0,10] × lat [0,10]
 *   soldSquare     : an already-sold boundary → lng [5,15] × lat [0,10]  (right half overlaps)
 * A block at lng<5 is inside the iso and NOT sold (counts). A block at 5<lng<10 is inside
 * the iso but sold-clipped (excluded). A block at lng>10 is outside the iso entirely.
 */

import type { BlockGroupRecord } from '../polygon-apportionment'

export const isoSquare: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: { contour: 30 },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  },
}

export const soldSquare: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [5, 0],
        [15, 0],
        [15, 10],
        [5, 10],
        [5, 0],
      ],
    ],
  },
}

/** Sold boundaries as a FeatureCollection — how the engine unions several without a boolean op. */
export const soldUnion: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [soldSquare],
}

/**
 * A flat B19001 histogram totalling `total` households, spread so a known income share
 * qualifies. Puts everything in the $200k+ open-top bracket (always qualifies) plus the
 * total var, so incomeQualifiedShare ≈ 1 for a clean, hand-checkable addressable number.
 */
export function flatB19001(total: number): Record<string, number> {
  return {
    B19001_001E: total, // total households
    B19001_017E: total, // $200k+ (open top bracket → fully qualifies at any threshold ≤ 200k)
  }
}

/**
 * One block group entirely inside the iso's LEFT (unsold) half, in Texas (FIPS 48).
 * Two blocks, both at lng<5 → both count even after sold clipping.
 */
export const bgTexasLeft: BlockGroupRecord = {
  geoid: '480010001001',
  stateFips: '48',
  b19001: flatB19001(1000),
  blocks: [
    { households: 600, point: [2, 2] },
    { households: 400, point: [3, 8] },
  ],
}

/**
 * One block group straddling the sold line, in Oklahoma (FIPS 40). Half its households
 * sit at lng<5 (count) and half at 5<lng<10 (inside iso but sold-clipped → excluded).
 */
export const bgOklahomaStraddle: BlockGroupRecord = {
  geoid: '400010001001',
  stateFips: '40',
  b19001: flatB19001(1000),
  blocks: [
    { households: 500, point: [4, 5] }, // unsold half → counts
    { households: 500, point: [7, 5] }, // sold half → excluded when clipping
  ],
}

/**
 * One block group entirely OUTSIDE the iso (lng>10) → contributes nothing regardless
 * of clipping. Nevada (FIPS 32).
 */
export const bgNevadaOutside: BlockGroupRecord = {
  geoid: '320010001001',
  stateFips: '32',
  b19001: flatB19001(1000),
  blocks: [
    { households: 1000, point: [12, 5] },
  ],
}
