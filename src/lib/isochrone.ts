/**
 * Server-side Mapbox Isochrone fetch for the v3 sizing engine (§1.1, §3.1).
 *
 * Distinct from the client map's isochrone call in TerritoryDetailMap.tsx: that runs
 * in the browser with the referer-restricted NEXT_PUBLIC_MAPBOX_TOKEN and is cosmetic.
 * This runs server-side during candidate-territory evaluation with MAPBOX_SERVER_TOKEN
 * (provisioned by Trace, Hard Rule 6 — read here, never set, no fabricated fallback),
 * and its polygons feed household apportionment + sold-area clipping.
 *
 * Mapbox limits honored (verified in the scoping doc §0): max 4 contours per request,
 * max 60 min/contour (the 45-min ceiling fits), polygons=true returns GeoJSON,
 * denoise=1.0 keeps only the largest contour (resolved decision #89 flag #5 — a single
 * defensible catchment, detached pockets discarded). generalize is left at the Mapbox
 * default; any consumer of the returned geometry must still validate before spatial
 * ops (self-intersection guard, §1.2) — see the sizing route's PostGIS ST_MakeValid.
 */

export const MAPBOX_ISOCHRONE_BASE = 'https://api.mapbox.com/isochrone/v1/mapbox/driving'

/** Max contours Mapbox accepts in one isochrone request. */
export const MAPBOX_MAX_CONTOURS = 4

/** Resolved decision #89 flag #5: largest contour only (single defensible catchment). */
export const V3_ISOCHRONE_DENOISE = 1.0

/** Typed Mapbox isochrone failure carrying HTTP status + upstream body. */
export class IsochroneError extends Error {
  readonly status: number
  readonly detail: string
  constructor(status: number, detail: string) {
    super(`Mapbox isochrone error (${status}): ${detail}`)
    this.name = 'IsochroneError'
    this.status = status
    this.detail = detail
  }
}

export interface IsochroneCenter {
  lat: number
  lng: number
}

/** One drive-time contour polygon returned by Mapbox. */
export interface IsochroneContour {
  minutes: number
  polygon: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
}

/** Provenance recorded on territories.boundary_source for auditability. */
export interface IsochroneProvenance {
  mapbox_profile: 'driving'
  denoise: number
  contours_probed: number[]
  isochrone_fetched_at: string
}

/**
 * Read the server-side Mapbox token. Throws (never fabricates a value) when unset, so a
 * missing secret surfaces as a clear server error instead of a silent bad request.
 */
export function requireMapboxServerToken(): string {
  const token = process.env.MAPBOX_SERVER_TOKEN
  if (!token) {
    throw new IsochroneError(0, 'MAPBOX_SERVER_TOKEN is not set in the server environment')
  }
  return token
}

/** Build the isochrone request URL for up to 4 contour minutes. */
export function buildIsochroneUrl(
  center: IsochroneCenter,
  minutes: number[],
  token: string,
  denoise: number = V3_ISOCHRONE_DENOISE,
): string {
  if (minutes.length === 0 || minutes.length > MAPBOX_MAX_CONTOURS) {
    throw new IsochroneError(0, `isochrone request needs 1–${MAPBOX_MAX_CONTOURS} contours, got ${minutes.length}`)
  }
  const sorted = [...minutes].sort((a, b) => a - b)
  const url = new URL(`${MAPBOX_ISOCHRONE_BASE}/${center.lng},${center.lat}`)
  url.searchParams.set('contours_minutes', sorted.join(','))
  url.searchParams.set('polygons', 'true')
  url.searchParams.set('denoise', String(denoise))
  url.searchParams.set('access_token', token)
  return url.toString()
}

/**
 * Map a Mapbox isochrone FeatureCollection to one contour polygon per requested minute.
 * Mapbox tags each feature with `properties.contour` (the minute). Pure — separated from
 * the fetch so it is unit-testable against a fixture FeatureCollection.
 */
export function contoursFromFeatureCollection(
  fc: GeoJSON.FeatureCollection,
  requestedMinutes: number[],
): IsochroneContour[] {
  const byMinute = new Map<number, GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>()
  for (const f of fc.features) {
    const minute = Number(f.properties?.contour)
    const t = f.geometry?.type
    if (!Number.isFinite(minute) || (t !== 'Polygon' && t !== 'MultiPolygon')) continue
    byMinute.set(minute, f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>)
  }
  const out: IsochroneContour[] = []
  for (const m of requestedMinutes) {
    const polygon = byMinute.get(m)
    if (polygon) out.push({ minutes: m, polygon })
  }
  return out
}

/**
 * Fetch drive-time isochrone contours for up to 4 minutes in a single Mapbox request.
 * Live IO — not exercised in CI (the pure mapping above is what tests cover, per the
 * PR-B brief). Throws IsochroneError on a missing token or non-200 response.
 */
export async function fetchIsochroneContours(
  center: IsochroneCenter,
  minutes: number[],
  denoise: number = V3_ISOCHRONE_DENOISE,
): Promise<IsochroneContour[]> {
  const token = requireMapboxServerToken()
  const res = await fetch(buildIsochroneUrl(center, minutes, token, denoise), { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new IsochroneError(res.status, body.trim() || res.statusText)
  }
  const fc = (await res.json()) as GeoJSON.FeatureCollection
  if (!fc?.features?.length) {
    throw new IsochroneError(res.status, 'Mapbox returned an empty isochrone FeatureCollection')
  }
  return contoursFromFeatureCollection(fc, minutes)
}
