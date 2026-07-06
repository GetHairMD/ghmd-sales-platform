/**
 * Pure GeoJSON point-in-polygon primitives for the v3 drive-time sizing engine.
 *
 * These are dependency-free (no turf, no PostGIS) so the household-weighting and
 * clipping-for-counting logic is deterministic and unit-testable against fixture
 * GeoJSON in CI — matching docs/V3-DRIVE-TIME-SCOPING.md §6 (pin the polygon, not
 * the API call) and the PR-B brief (fixture GeoJSON, not live Mapbox calls).
 *
 * WHY point-in-polygon rather than polygon boolean ops for the addressable count:
 * v3 apportions households by the DASYMETRIC block method (§3.2, resolved flag #3 —
 * population/household-weighted). A census block's households are attributed whole
 * to whichever area contains the block's representative point. So "households inside
 * the isochrone" and "households inside the unclaimed (post-clip) area" both reduce
 * to point-in-polygon tests — a block counts iff its point is in the isochrone AND
 * not in any already-sold boundary (§4.1 first-sold precedence). No polygon area or
 * boolean-difference math is needed for the count itself; the persisted clipped
 * boundary geometry is computed separately in PostGIS (see the sizing route).
 *
 * SRID: all coordinates are WGS84 lng/lat ([lng, lat]) to match Mapbox isochrone
 * output and the geometry(...,4326) columns. Ray casting is planar in lng/lat, which
 * is correct for point containment (containment is topological, not metric — no
 * projection/area distortion concern at these scales).
 */

export type Position = [number, number] // [lng, lat]
type LinearRing = Position[]
type PolygonCoords = LinearRing[] // [outerRing, ...holes]
type MultiPolygonCoords = PolygonCoords[]

/**
 * A geometry usable for containment tests: a raw Polygon/MultiPolygon geometry, a
 * Feature wrapping one, or a FeatureCollection of them (Mapbox returns a collection).
 */
export type PolygonalGeometry =
  | GeoJSON.Polygon
  | GeoJSON.MultiPolygon
  | GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
  | GeoJSON.FeatureCollection

/**
 * Ray-casting containment for a single linear ring. Points exactly on an edge are
 * treated as inside (boundary-inclusive) so a block point on a shared iso/sold edge
 * is not silently dropped. Winding order is irrelevant to the crossing-number test.
 */
export function pointInRing(point: Position, ring: LinearRing): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]

    // On-segment (with epsilon) → treat as inside.
    if (pointOnSegment(x, y, xi, yi, xj, yj)) return true

    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

const EPS = 1e-12

function pointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  // Collinearity via cross product, then bounding-box check.
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax)
  if (Math.abs(cross) > EPS) return false
  const minX = Math.min(ax, bx) - EPS
  const maxX = Math.max(ax, bx) + EPS
  const minY = Math.min(ay, by) - EPS
  const maxY = Math.max(ay, by) + EPS
  return px >= minX && px <= maxX && py >= minY && py <= maxY
}

/** Containment for one Polygon: inside the outer ring and outside every hole. */
export function pointInPolygonCoords(point: Position, coords: PolygonCoords): boolean {
  if (coords.length === 0) return false
  const [outer, ...holes] = coords
  if (!pointInRing(point, outer)) return false
  for (const hole of holes) {
    if (pointInRing(point, hole)) return false
  }
  return true
}

/** Containment for a MultiPolygon: inside any constituent polygon. */
export function pointInMultiPolygonCoords(
  point: Position,
  coords: MultiPolygonCoords,
): boolean {
  return coords.some((poly) => pointInPolygonCoords(point, poly))
}

/**
 * Containment against any PolygonalGeometry (geometry, Feature, or FeatureCollection).
 * A FeatureCollection is inside iff the point is inside ANY of its polygonal features
 * (this is how the union of already-sold boundaries is tested without a boolean union).
 */
export function pointInGeometry(point: Position, geom: PolygonalGeometry | null | undefined): boolean {
  if (!geom) return false

  switch (geom.type) {
    case 'Polygon':
      return pointInPolygonCoords(point, geom.coordinates as PolygonCoords)
    case 'MultiPolygon':
      return pointInMultiPolygonCoords(point, geom.coordinates as MultiPolygonCoords)
    case 'Feature':
      return pointInGeometry(point, geom.geometry as PolygonalGeometry)
    case 'FeatureCollection':
      return geom.features.some((f) =>
        pointInGeometry(point, f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>),
      )
    default:
      return false
  }
}

/** Axis-aligned bounding box [minLng, minLat, maxLng, maxLat]. */
export type BBox = [number, number, number, number]

function extendBBox(acc: BBox, ring: LinearRing): void {
  for (const [lng, lat] of ring) {
    if (lng < acc[0]) acc[0] = lng
    if (lat < acc[1]) acc[1] = lat
    if (lng > acc[2]) acc[2] = lng
    if (lat > acc[3]) acc[3] = lat
  }
}

/**
 * Bounding box of any PolygonalGeometry. Used to build the TIGERweb envelope query
 * (fetch only the block groups near the isochrone before the exact point-in-polygon
 * pass). Throws on an empty/degenerate geometry so a bad isochrone fails loudly.
 */
export function bboxOf(geom: PolygonalGeometry): BBox {
  const acc: BBox = [Infinity, Infinity, -Infinity, -Infinity]
  const visit = (g: PolygonalGeometry): void => {
    switch (g.type) {
      case 'Polygon':
        (g.coordinates as PolygonCoords).forEach((r) => extendBBox(acc, r))
        break
      case 'MultiPolygon':
        (g.coordinates as MultiPolygonCoords).forEach((poly) => poly.forEach((r) => extendBBox(acc, r)))
        break
      case 'Feature':
        visit(g.geometry as PolygonalGeometry)
        break
      case 'FeatureCollection':
        g.features.forEach((f) => visit(f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>))
        break
    }
  }
  visit(geom)
  if (!acc.every(Number.isFinite)) throw new Error('bboxOf: geometry has no coordinates')
  return acc
}

/**
 * Point is inside `include` and NOT inside `exclude` — the clipping-for-counting
 * predicate (§4.1). `exclude` is the union of already-sold boundaries (pass a
 * FeatureCollection to union several without a boolean op); omit it pre-sale.
 */
export function pointInClippedArea(
  point: Position,
  include: PolygonalGeometry,
  exclude?: PolygonalGeometry | null,
): boolean {
  if (!pointInGeometry(point, include)) return false
  if (exclude && pointInGeometry(point, exclude)) return false
  return true
}
