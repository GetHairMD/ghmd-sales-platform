import { describe, expect, it } from 'vitest'
import {
  pointInRing,
  pointInPolygonCoords,
  pointInMultiPolygonCoords,
  pointInGeometry,
  pointInClippedArea,
  type Position,
} from '../geometry'
import { isoSquare, soldSquare, soldUnion } from '../__fixtures__/v3-geo'

const square: Position[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
  [0, 0],
]

describe('pointInRing', () => {
  it('interior point is inside', () => {
    expect(pointInRing([5, 5], square)).toBe(true)
  })
  it('exterior point is outside', () => {
    expect(pointInRing([15, 5], square)).toBe(false)
    expect(pointInRing([-1, 5], square)).toBe(false)
  })
  it('point on an edge is treated as inside (boundary-inclusive)', () => {
    expect(pointInRing([0, 5], square)).toBe(true)
    expect(pointInRing([10, 10], square)).toBe(true)
  })
})

describe('pointInPolygonCoords with a hole', () => {
  const withHole = [
    square,
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ] as Position[],
  ]
  it('inside the outer ring counts', () => {
    expect(pointInPolygonCoords([2, 2], withHole)).toBe(true)
  })
  it('inside a hole does not count', () => {
    expect(pointInPolygonCoords([5, 5], withHole)).toBe(false)
  })
})

describe('pointInMultiPolygonCoords', () => {
  const mp = [
    [square],
    [
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
        [20, 20],
      ] as Position[],
    ],
  ]
  it('inside either constituent polygon counts', () => {
    expect(pointInMultiPolygonCoords([5, 5], mp)).toBe(true)
    expect(pointInMultiPolygonCoords([25, 25], mp)).toBe(true)
  })
  it('in the gap between them does not', () => {
    expect(pointInMultiPolygonCoords([15, 15], mp)).toBe(false)
  })
})

describe('pointInGeometry across GeoJSON shapes', () => {
  it('handles a Feature<Polygon> (the isochrone fixture)', () => {
    expect(pointInGeometry([5, 5], isoSquare)).toBe(true)
    expect(pointInGeometry([12, 5], isoSquare)).toBe(false)
  })
  it('handles a FeatureCollection as a union (sold boundaries)', () => {
    expect(pointInGeometry([7, 5], soldUnion)).toBe(true) // inside soldSquare
    expect(pointInGeometry([2, 5], soldUnion)).toBe(false) // left of soldSquare
  })
  it('null/undefined geometry is never containing', () => {
    expect(pointInGeometry([5, 5], null)).toBe(false)
    expect(pointInGeometry([5, 5], undefined)).toBe(false)
  })
})

describe('pointInClippedArea (isochrone \\ sold) — §4.1 first-sold precedence', () => {
  it('inside iso and NOT sold → counts', () => {
    expect(pointInClippedArea([2, 5], isoSquare, soldSquare)).toBe(true)
  })
  it('inside iso but inside sold → excluded', () => {
    expect(pointInClippedArea([7, 5], isoSquare, soldSquare)).toBe(false)
  })
  it('outside iso → excluded regardless of sold', () => {
    expect(pointInClippedArea([12, 5], isoSquare, soldSquare)).toBe(false)
  })
  it('no sold argument → pure isochrone containment', () => {
    expect(pointInClippedArea([7, 5], isoSquare)).toBe(true)
  })
})
