import { describe, expect, it } from 'vitest'
import {
  buildMapboxGeocodeUrl,
  parseGeocodeResponse,
  parseManualCenter,
  parseApiCoordinate,
} from '../geocode'

describe('buildMapboxGeocodeUrl', () => {
  it('targets the Mapbox v6 forward endpoint with the token and query', () => {
    const url = new URL(buildMapboxGeocodeUrl('Austin, TX', 'tok_123'))
    expect(url.origin + url.pathname).toBe(
      'https://api.mapbox.com/search/geocode/v6/forward',
    )
    expect(url.searchParams.get('q')).toBe('Austin, TX')
    expect(url.searchParams.get('access_token')).toBe('tok_123')
  })

  it('scopes results to a small US-biased candidate set', () => {
    const url = new URL(buildMapboxGeocodeUrl('Westlake', 'tok'))
    expect(url.searchParams.get('country')).toBe('us')
    expect(Number(url.searchParams.get('limit'))).toBeGreaterThan(0)
  })

  it('url-encodes special characters in the query', () => {
    const url = buildMapboxGeocodeUrl('Coeur d’Alene & 3rd', 'tok')
    // raw ampersand would spawn a bogus query param; must be encoded
    expect(url).not.toContain('& 3rd')
    expect(new URL(url).searchParams.get('q')).toBe('Coeur d’Alene & 3rd')
  })
})

describe('parseGeocodeResponse', () => {
  it('maps v6 features to {label, lat, lng} (coordinates are [lng, lat])', () => {
    const json = {
      features: [
        {
          geometry: { type: 'Point', coordinates: [-97.8, 30.27] },
          properties: { full_address: 'Austin, Texas, United States', name: 'Austin' },
        },
      ],
    }
    expect(parseGeocodeResponse(json)).toEqual([
      { label: 'Austin, Texas, United States', lat: 30.27, lng: -97.8 },
    ])
  })

  it('falls back to name when full_address is absent', () => {
    const json = {
      features: [
        { geometry: { coordinates: [-1, 2] }, properties: { name: 'Somewhere' } },
      ],
    }
    expect(parseGeocodeResponse(json)[0].label).toBe('Somewhere')
  })

  it('returns an empty array when there are no features', () => {
    expect(parseGeocodeResponse({ features: [] })).toEqual([])
    expect(parseGeocodeResponse({})).toEqual([])
    expect(parseGeocodeResponse(null)).toEqual([])
  })

  it('skips features with missing or non-finite coordinates', () => {
    const json = {
      features: [
        { geometry: { coordinates: [-97.8, 30.27] }, properties: { name: 'Good' } },
        { geometry: { coordinates: [null, 30] }, properties: { name: 'BadLng' } },
        { properties: { name: 'NoGeometry' } },
        { geometry: { coordinates: ['x', 'y'] }, properties: { name: 'NaN' } },
      ],
    }
    const out = parseGeocodeResponse(json)
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('Good')
  })
})

describe('parseManualCenter', () => {
  it('parses a valid lat/lng pair', () => {
    expect(parseManualCenter('30.2672', '-97.7431')).toEqual({ lat: 30.2672, lng: -97.7431 })
  })

  it('returns null when either field is blank or whitespace (empty string must not become 0)', () => {
    expect(parseManualCenter('30.2672', '')).toBeNull()
    expect(parseManualCenter('', '-97.74')).toBeNull()
    expect(parseManualCenter('  ', '-97.74')).toBeNull()
    expect(parseManualCenter('30', '   ')).toBeNull()
  })

  it('returns null for out-of-range or non-numeric values', () => {
    expect(parseManualCenter('91', '0')).toBeNull()
    expect(parseManualCenter('0', '181')).toBeNull()
    expect(parseManualCenter('abc', '0')).toBeNull()
  })

  it('accepts an explicitly typed zero coordinate', () => {
    expect(parseManualCenter('0', '0')).toEqual({ lat: 0, lng: 0 })
  })
})

describe('parseApiCoordinate', () => {
  it('accepts a finite number in range', () => {
    expect(parseApiCoordinate(30.5, -90, 90)).toBe(30.5)
  })

  it('accepts a non-empty numeric string', () => {
    expect(parseApiCoordinate('-97.74', -180, 180)).toBe(-97.74)
  })

  it('rejects the falsy-coercion traps that Number() turns into 0', () => {
    // Number(null) / Number(false) / Number([]) / Number('') all === 0 — must NOT pass.
    expect(parseApiCoordinate(null, -90, 90)).toBeNull()
    expect(parseApiCoordinate(undefined, -90, 90)).toBeNull()
    expect(parseApiCoordinate(false, -90, 90)).toBeNull()
    expect(parseApiCoordinate([], -90, 90)).toBeNull()
    expect(parseApiCoordinate('', -90, 90)).toBeNull()
    expect(parseApiCoordinate('   ', -90, 90)).toBeNull()
  })

  it('rejects out-of-range and non-numeric values', () => {
    expect(parseApiCoordinate(91, -90, 90)).toBeNull()
    expect(parseApiCoordinate(181, -180, 180)).toBeNull()
    expect(parseApiCoordinate('abc', -90, 90)).toBeNull()
    expect(parseApiCoordinate(NaN, -90, 90)).toBeNull()
  })

  it('accepts an explicit zero (a real coordinate, unlike a blank field)', () => {
    expect(parseApiCoordinate(0, -90, 90)).toBe(0)
  })
})
