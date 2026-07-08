import { describe, it, expect } from 'vitest'
import { geojsonFeatureToEwkt } from '../territories/boundary-ewkt'

describe('geojsonFeatureToEwkt', () => {
  it('serializes a Polygon feature as a single-polygon EWKT MultiPolygon (SRID 4326)', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      },
    }
    expect(geojsonFeatureToEwkt(feature)).toBe(
      'SRID=4326;MULTIPOLYGON(((0 0, 0 1, 1 1, 1 0, 0 0)))',
    )
  })

  it('serializes a MultiPolygon feature preserving both polygons', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [0, 1], [1, 1], [0, 0]]],
          [[[2, 2], [2, 3], [3, 3], [2, 2]]],
        ],
      },
    }
    expect(geojsonFeatureToEwkt(feature)).toBe(
      'SRID=4326;MULTIPOLYGON(((0 0, 0 1, 1 1, 0 0)), ((2 2, 2 3, 3 3, 2 2)))',
    )
  })

  it('serializes a polygon with an interior ring (hole)', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]],
          [[3, 3], [3, 6], [6, 6], [6, 3], [3, 3]],
        ],
      },
    }
    expect(geojsonFeatureToEwkt(feature)).toBe(
      'SRID=4326;MULTIPOLYGON(((0 0, 0 10, 10 10, 10 0, 0 0), (3 3, 3 6, 6 6, 6 3, 3 3)))',
    )
  })

  it('drops any z coordinate, keeping only lng/lat', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0, 99], [0, 1, 99], [1, 1, 99], [0, 0, 99]]],
      },
    }
    expect(geojsonFeatureToEwkt(feature)).toBe('SRID=4326;MULTIPOLYGON(((0 0, 0 1, 1 1, 0 0)))')
  })

  it('throws for a non-polygonal geometry', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [0, 0] },
    } as unknown as GeoJSON.Feature
    expect(() => geojsonFeatureToEwkt(feature)).toThrow()
  })
})
