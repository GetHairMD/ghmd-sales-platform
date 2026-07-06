import { describe, expect, it } from 'vitest'
import {
  buildIsochroneUrl,
  contoursFromFeatureCollection,
  requireMapboxServerToken,
  IsochroneError,
  MAPBOX_MAX_CONTOURS,
  V3_ISOCHRONE_DENOISE,
} from '../isochrone'

const center = { lat: 30.27, lng: -97.74 } // Austin-ish; abstract for URL assembly

describe('buildIsochroneUrl', () => {
  it('assembles a driving isochrone URL with sorted contours, polygons, denoise', () => {
    const url = new URL(buildIsochroneUrl(center, [35, 15, 25], 'tok_test'))
    expect(url.pathname).toContain('/isochrone/v1/mapbox/driving/-97.74,30.27')
    expect(url.searchParams.get('contours_minutes')).toBe('15,25,35') // sorted
    expect(url.searchParams.get('polygons')).toBe('true')
    expect(url.searchParams.get('denoise')).toBe(String(V3_ISOCHRONE_DENOISE))
    expect(url.searchParams.get('access_token')).toBe('tok_test')
  })

  it('rejects more than the Mapbox 4-contour maximum', () => {
    expect(() => buildIsochroneUrl(center, [15, 25, 35, 45, 55], 'tok', 1)).toThrow(IsochroneError)
    expect(MAPBOX_MAX_CONTOURS).toBe(4)
  })

  it('rejects an empty contour list', () => {
    expect(() => buildIsochroneUrl(center, [], 'tok', 1)).toThrow(IsochroneError)
  })
})

describe('contoursFromFeatureCollection', () => {
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { contour: 45 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      },
      {
        type: 'Feature',
        properties: { contour: 25 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] },
      },
    ],
  }

  it('maps each requested minute to its contour polygon', () => {
    const contours = contoursFromFeatureCollection(fc, [25, 45])
    expect(contours.map((c) => c.minutes)).toEqual([25, 45])
    expect(contours[0].polygon.properties?.contour).toBe(25)
  })

  it('omits requested minutes with no matching feature', () => {
    const contours = contoursFromFeatureCollection(fc, [25, 35, 45])
    expect(contours.map((c) => c.minutes)).toEqual([25, 45]) // 35 absent
  })

  it('ignores non-polygonal features defensively', () => {
    const mixed: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { contour: 30 }, geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
    }
    expect(contoursFromFeatureCollection(mixed, [30])).toEqual([])
  })
})

describe('requireMapboxServerToken', () => {
  it('throws a typed error when MAPBOX_SERVER_TOKEN is unset (no fabricated fallback)', () => {
    const prev = process.env.MAPBOX_SERVER_TOKEN
    delete process.env.MAPBOX_SERVER_TOKEN
    try {
      expect(() => requireMapboxServerToken()).toThrow(IsochroneError)
    } finally {
      if (prev !== undefined) process.env.MAPBOX_SERVER_TOKEN = prev
    }
  })

  it('returns the token when set', () => {
    const prev = process.env.MAPBOX_SERVER_TOKEN
    process.env.MAPBOX_SERVER_TOKEN = 'tok_live'
    try {
      expect(requireMapboxServerToken()).toBe('tok_live')
    } finally {
      if (prev === undefined) delete process.env.MAPBOX_SERVER_TOKEN
      else process.env.MAPBOX_SERVER_TOKEN = prev
    }
  })
})
