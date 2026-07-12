/**
 * Mapbox forward-geocoding helpers (address → lat/lng) for the New Territory flow.
 *
 * There is no forward-geocode helper elsewhere in the codebase (only reverse
 * geocode in census.ts and the isochrone drive-time call). The network fetch lives
 * in the server route `/api/geocode`; URL building + response parsing are pure and
 * unit-tested here. Server-side use avoids the NEXT_PUBLIC_MAPBOX_TOKEN referer
 * restriction (that only gates browser-origin requests).
 */

export interface GeocodeCandidate {
  label: string
  lat: number
  lng: number
}

/** Small US-biased candidate set from the Mapbox v6 forward endpoint. */
export function buildMapboxGeocodeUrl(query: string, token: string): string {
  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward')
  url.searchParams.set('q', query)
  url.searchParams.set('access_token', token)
  url.searchParams.set('country', 'us')
  url.searchParams.set('limit', '5')
  return url.toString()
}

function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Parse the manual lat/lng fallback inputs into a center, or null if invalid.
 *
 * Guards the `Number('') === 0` trap: a blank/whitespace field must NOT resolve to 0 (that
 * would silently create a territory at the wrong center, e.g. lng=0 off West Africa). Both
 * fields must be non-empty, finite, and in range. An explicitly typed 0 is accepted.
 */
export function parseManualCenter(
  latStr: string,
  lngStr: string,
): { lat: number; lng: number } | null {
  if (latStr.trim() === '' || lngStr.trim() === '') return null
  const lat = Number(latStr)
  const lng = Number(lngStr)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/** Map a Mapbox v6 GeoJSON response to {label, lat, lng}; drops malformed features. */
export function parseGeocodeResponse(json: unknown): GeocodeCandidate[] {
  const features = (json as { features?: unknown })?.features
  if (!Array.isArray(features)) return []

  const out: GeocodeCandidate[] = []
  for (const feature of features) {
    const coords = (feature as { geometry?: { coordinates?: unknown } })?.geometry
      ?.coordinates
    if (!Array.isArray(coords)) continue
    const lng = finiteNumber(coords[0])
    const lat = finiteNumber(coords[1])
    if (lng === null || lat === null) continue

    const props = (feature as { properties?: Record<string, unknown> })?.properties ?? {}
    const label =
      (typeof props.full_address === 'string' && props.full_address) ||
      (typeof props.name === 'string' && props.name) ||
      (typeof props.place_formatted === 'string' && props.place_formatted) ||
      `${lat}, ${lng}`

    out.push({ label, lat, lng })
  }
  return out
}
