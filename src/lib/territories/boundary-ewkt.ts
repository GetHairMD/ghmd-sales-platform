/**
 * GeoJSON (Polygon | MultiPolygon) Feature → PostGIS EWKT MultiPolygon string.
 *
 * WHY: territories.boundary_geom is a PostGIS geometry(MultiPolygon,4326). PostgREST/
 * supabase-js does not convert a GeoJSON object to geometry on write, but Postgres's
 * geometry input function accepts EWKT ("SRID=4326;MULTIPOLYGON(...)"). Serializing to EWKT
 * lets the approve action persist boundary_geom via the ordinary service-role client with
 * NO RPC and NO migration (verified against the DB: EWKT round-trips at SRID 4326). Polygons
 * are promoted to a single-element MultiPolygon so the column's declared type always matches.
 */

type Position = number[]
type Ring = Position[]
type PolygonCoords = Ring[]

function ringToWkt(ring: Ring): string {
  return '(' + ring.map(([x, y]) => `${x} ${y}`).join(', ') + ')'
}

function polygonToWkt(rings: PolygonCoords): string {
  return '(' + rings.map(ringToWkt).join(', ') + ')'
}

/**
 * Serialize a polygonal GeoJSON Feature to `SRID=4326;MULTIPOLYGON(...)`. Only the first two
 * ordinates (lng, lat) of each position are emitted; any z/m is dropped. Throws for a
 * non-polygonal geometry so a bad input fails loudly rather than writing an invalid boundary.
 */
export function geojsonFeatureToEwkt(feature: GeoJSON.Feature): string {
  const geometry = feature?.geometry
  if (!geometry) throw new Error('geojsonFeatureToEwkt: feature has no geometry')

  let polygons: PolygonCoords[]
  if (geometry.type === 'Polygon') {
    polygons = [geometry.coordinates as PolygonCoords]
  } else if (geometry.type === 'MultiPolygon') {
    polygons = geometry.coordinates as PolygonCoords[]
  } else {
    throw new Error(`geojsonFeatureToEwkt: unsupported geometry type "${geometry.type}"`)
  }

  const body = polygons.map(polygonToWkt).join(', ')
  return `SRID=4326;MULTIPOLYGON(${body})`
}
