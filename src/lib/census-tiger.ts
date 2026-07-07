/**
 * Census data source for v3 polygon apportionment (§3.2) — the live adapter behind
 * fetchB19001ForPolygon's injectable `ApportionmentDeps`.
 *
 * SCOPE / VERIFICATION NOTE: the PURE parsing/assembly helpers here are unit-tested
 * (census-tiger.test.ts). The NETWORK orchestration (TIGERweb geometry queries +
 * Census ACS/decennial fetches) is integration code that is NOT run in CI — per the
 * PR-B brief (fixtures, not live calls) and scoping doc §7b, which flags block-group
 * intersection + block-level household weighting as the one area needing a live spike
 * before the engine sizes a real territory. It needs a provisioned CENSUS_API_KEY and
 * a live smoke-test (Trace/Chat) to confirm response shapes against the current TIGERweb
 * service revision. The deterministic engine that CONSUMES these records is fully tested.
 *
 * Data sources:
 *  - TIGERweb ArcGIS REST (block-group + block geometries/centroids) — no key required.
 *  - Census ACS 5-year B19001 (block-group income histograms) — CENSUS_API_KEY.
 *  - Census 2020 DHC H1_001N (block household counts, the dasymetric weight unit for
 *    resolved flag #3 — population/household-weighted) — CENSUS_API_KEY.
 */

import { CENSUS_ACS5_VINTAGE } from '../../lib/addressable-market-constants'
import { B19001_FETCH_VARS } from './income-screen'
import { type BBox, type PolygonalGeometry, type Position } from './geometry'
import type { ApportionmentDeps, BlockGroupRecord, BlockRecord } from './polygon-apportionment'
import { mapPool, CENSUS_FETCH_CONCURRENCY } from './concurrency'
import type { BlockGroupWithCentroid } from './census-bg-cache'

/** TIGERweb ArcGIS REST — current ACS vintage layers (block groups) and 2020 blocks. */
export const TIGERWEB_BG_LAYER =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2023/MapServer/10/query'
export const TIGERWEB_BLOCKS_LAYER =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/12/query'

/** Census decennial 2020 DHC total-households variable (block-level weight denominator). */
export const DEC_HOUSEHOLDS_VAR = 'H1_001N'

export class CensusTigerError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(`Census/TIGER error (${status}): ${message}`)
    this.name = 'CensusTigerError'
    this.status = status
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested)
// ─────────────────────────────────────────────────────────────────────────────

/** ArcGIS envelope query geometry string from a bbox: "minLng,minLat,maxLng,maxLat". */
export function bboxToEnvelope(bbox: BBox): string {
  return bbox.join(',')
}

/** Split a 12-digit block-group GEOID into its census geography parts. */
export function splitBlockGroupGeoid(geoid: string): {
  stateFips: string
  countyFips: string
  tract: string
  blockGroup: string
} {
  if (!/^\d{12}$/.test(geoid)) {
    throw new CensusTigerError(0, `expected a 12-digit block-group GEOID, got "${geoid}"`)
  }
  return {
    stateFips: geoid.slice(0, 2),
    countyFips: geoid.slice(2, 5),
    tract: geoid.slice(5, 11),
    blockGroup: geoid.slice(11, 12),
  }
}

/**
 * Parse a Census API table response ([[header...],[row...],...]) into keyed objects.
 * Non-numeric values are left as strings; the caller coerces the fields it needs.
 */
export function parseCensusTable(rows: unknown): Array<Record<string, string>> {
  if (!Array.isArray(rows) || rows.length < 1) {
    throw new CensusTigerError(0, 'Census returned empty or malformed data')
  }
  const [headers, ...data] = rows as string[][]
  return data.map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = row[i]
    })
    return obj
  })
}

/** B19001 histogram (variable → count) from one parsed ACS row. */
export function b19001HistogramFromRow(row: Record<string, string>): Record<string, number> {
  const hist: Record<string, number> = {}
  for (const v of B19001_FETCH_VARS) {
    const n = Number.parseInt(row[v] ?? '', 10)
    hist[v] = Number.isFinite(n) && n >= 0 ? n : 0
  }
  return hist
}

/** ArcGIS block/blockgroup feature → representative interior point [lng, lat]. */
export function centroidOfArcgisFeature(feature: {
  geometry?: { rings?: number[][][] }
  attributes?: Record<string, unknown>
}): Position | null {
  const attrs = feature.attributes ?? {}
  const cx = Number(attrs.CENTLON ?? attrs.INTPTLON)
  const cy = Number(attrs.CENTLAT ?? attrs.INTPTLAT)
  if (Number.isFinite(cx) && Number.isFinite(cy)) return [cx, cy]

  // Fallback: average the outer ring vertices.
  const ring = feature.geometry?.rings?.[0]
  if (ring && ring.length) {
    const [sx, sy] = ring.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0])
    return [sx / ring.length, sy / ring.length]
  }
  return null
}

/** Outer ring (first ring) of every polygon in a PolygonalGeometry, as [lng,lat] rings. */
export function outerRingsOf(geom: PolygonalGeometry): Position[][] {
  const rings: Position[][] = []
  const visit = (g: PolygonalGeometry): void => {
    switch (g.type) {
      case 'Polygon':
        if (g.coordinates[0]) rings.push(g.coordinates[0] as Position[])
        break
      case 'MultiPolygon':
        for (const poly of g.coordinates) if (poly[0]) rings.push(poly[0] as Position[])
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
  return rings
}

/**
 * ArcGIS esriGeometryPolygon JSON for an intersects query. OUTER rings only (holes
 * dropped): the block-group set is a candidate prefilter, and outer-only can only
 * OVER-select (a stray block group inside a hole), never UNDER-select — over-selected
 * block groups are then correctly zero-weighted by the exact per-block apportionment,
 * so dropping holes is safe and avoids esri ring-orientation ambiguity.
 */
export function esriPolygonJson(isochrone: PolygonalGeometry): string {
  return JSON.stringify({ rings: outerRingsOf(isochrone), spatialReference: { wkid: 4326 } })
}

// ─────────────────────────────────────────────────────────────────────────────
// Live network orchestration (integration — not run in CI)
//
// Reworked for the async/cached data layer: a single polygon-INTERSECTS block-group
// query (server-side pre-clip, not a bbox envelope), a GEOID cache to skip already-known
// block groups, bounded-concurrency parallel fetches for the misses, and one DHC request
// per TRACT (deduped) instead of per block group. See docs / the sizing-jobs worker.
// ─────────────────────────────────────────────────────────────────────────────

/** Transient HTTP statuses worth retrying (Census/TIGERweb throw sporadic 5xx under load). */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * GET/POST JSON with small exponential backoff + jitter on transient failures. The cold
 * fan-out issues many county/TIGERweb requests, and Census returns sporadic 500s under
 * load; without this a single transient blip aborts the whole sizing run. Non-retryable
 * statuses (4xx other than 408/429) fail fast.
 */
async function getJson(url: string, init?: RequestInit, attempts = 4): Promise<unknown> {
  let lastErr: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store', ...init })
      if (res.ok) return await res.json()
      const body = await res.text().catch(() => '')
      const err = new CensusTigerError(res.status, body.trim() || res.statusText)
      if (attempt === attempts - 1 || !RETRYABLE_STATUS.has(res.status)) throw err
      lastErr = err
    } catch (e) {
      if (e instanceof CensusTigerError && !RETRYABLE_STATUS.has(e.status)) throw e
      if (attempt === attempts - 1) throw e
      lastErr = e
    }
    await sleep(250 * 2 ** attempt + Math.random() * 250)
  }
  throw lastErr
}

/** One block group returned by the intersects query: its GEOID + representative point. */
export interface IntersectingBlockGroup {
  geoid: string
  centroid: Position | null
}

/**
 * Block groups whose geometry INTERSECTS the isochrone polygon (precise server-side
 * pre-clip). POSTed (not GET) so a many-vertex isochrone never overruns the URL limit.
 */
async function fetchIntersectingBlockGroupIds(
  isochrone: PolygonalGeometry,
): Promise<IntersectingBlockGroup[]> {
  const body = new URLSearchParams({
    geometry: esriPolygonJson(isochrone),
    geometryType: 'esriGeometryPolygon',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'GEOID,CENTLON,CENTLAT',
    returnGeometry: 'false',
    f: 'json',
  })
  const json = (await getJson(TIGERWEB_BG_LAYER, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })) as { features?: Array<{ attributes?: Record<string, unknown> }> }

  const out: IntersectingBlockGroup[] = []
  for (const f of json.features ?? []) {
    const geoid = String(f.attributes?.GEOID ?? '')
    if (!/^\d{12}$/.test(geoid)) continue
    out.push({ geoid, centroid: centroidOfArcgisFeature(f) })
  }
  return out
}

/** ACS B19001 histograms for all block groups in one county (one request per county). */
async function fetchB19001ForCountyBGs(
  stateFips: string,
  countyFips: string,
  apiKey: string,
): Promise<Map<string, Record<string, number>>> {
  const url = new URL(`https://api.census.gov/data/${CENSUS_ACS5_VINTAGE}/acs/acs5`)
  url.searchParams.set('get', B19001_FETCH_VARS.join(','))
  url.searchParams.set('for', 'block group:*')
  url.searchParams.set('in', `state:${stateFips} county:${countyFips}`)
  url.searchParams.set('key', apiKey)
  const parsed = parseCensusTable(await getJson(url.toString()))
  const out = new Map<string, Record<string, number>>()
  for (const row of parsed) {
    const geoid = `${row.state}${row.county}${row.tract}${row['block group']}`
    out.set(geoid, b19001HistogramFromRow(row))
  }
  return out
}

/**
 * Household counts per block for one whole COUNTY (2020 DHC H1_001N), keyed by block GEOID.
 * ONE request per county replaces the old per-tract (≈ hundreds) and per-block-group fan-out
 * — the Census API serves every block in the county in a single response.
 */
async function fetchDhcHouseholdsForCounty(
  stateFips: string,
  countyFips: string,
  apiKey: string,
): Promise<Map<string, number>> {
  const decUrl = new URL('https://api.census.gov/data/2020/dec/dhc')
  decUrl.searchParams.set('get', DEC_HOUSEHOLDS_VAR)
  decUrl.searchParams.set('for', 'block:*')
  decUrl.searchParams.set('in', `state:${stateFips} county:${countyFips}`)
  decUrl.searchParams.set('key', apiKey)
  const rows = parseCensusTable(await getJson(decUrl.toString()))
  const out = new Map<string, number>()
  for (const row of rows) {
    const blockGeoid = `${row.state}${row.county}${row.tract}${row.block}`
    const n = Number.parseInt(row[DEC_HOUSEHOLDS_VAR] ?? '', 10)
    out.set(blockGeoid, Number.isFinite(n) && n >= 0 ? n : 0)
  }
  return out
}

/** TIGERweb page size (server maxRecordCount ≈ 6000; we page until the limit is not exceeded). */
const TIGERWEB_PAGE = 6000

/**
 * TIGERweb block centroids for one whole COUNTY, keyed by block GEOID, paginated. Replaces
 * the per-block-group query (one per BG — ~1,000+ for a dense metro's 45-min contour) with
 * a handful of county-level pages. Returns the block→point map plus the number of HTTP
 * requests made (for stats).
 */
async function fetchBlockCentroidsForCounty(
  stateFips: string,
  countyFips: string,
): Promise<{ blocks: Map<string, Position>; requests: number }> {
  const blocks = new Map<string, Position>()
  const prefix = `${stateFips}${countyFips}` // 5-digit block-GEOID county prefix
  let offset = 0
  let requests = 0
  for (let page = 0; page < 200; page++) {
    const url = new URL(TIGERWEB_BLOCKS_LAYER)
    url.searchParams.set('where', `GEOID LIKE '${prefix}%'`)
    url.searchParams.set('outFields', 'GEOID,CENTLON,CENTLAT')
    url.searchParams.set('returnGeometry', 'false')
    url.searchParams.set('orderByFields', 'GEOID')
    url.searchParams.set('resultOffset', String(offset))
    url.searchParams.set('resultRecordCount', String(TIGERWEB_PAGE))
    url.searchParams.set('f', 'json')
    const tg = (await getJson(url.toString())) as {
      features?: Array<{ attributes?: Record<string, unknown> }>
      exceededTransferLimit?: boolean
    }
    requests++
    const feats = tg.features ?? []
    for (const f of feats) {
      const blockGeoid = String(f.attributes?.GEOID ?? '')
      const point = centroidOfArcgisFeature(f)
      if (blockGeoid && point) blocks.set(blockGeoid, point)
    }
    if (!tg.exceededTransferLimit || feats.length === 0) break
    offset += feats.length
  }
  return { blocks, requests }
}

/** Injectable GEOID cache (Supabase-backed at runtime; a fake in tests). */
export interface CensusCachePort {
  read: (geoids: string[]) => Promise<Map<string, BlockGroupRecord>>
  upsert: (records: BlockGroupWithCentroid[]) => Promise<void>
}

/** Per-run data-layer stats for observability (cold vs warm cache). */
export interface CensusTigerStats {
  blockGroupsIntersecting: number
  cacheHits: number
  cacheMisses: number
  /** Distinct counties fetched for the miss set (each = 1 B19001 + 1 DHC + N centroid pages). */
  counties: number
  /** Total census/TIGERweb HTTP requests made this run (excl. the 1 BG-intersect query). */
  censusRequests: number
  censusMs: number
}

/** ApportionmentDeps augmented with the per-run stats accumulator the worker reports. */
export interface CensusTigerDeps extends ApportionmentDeps {
  stats: CensusTigerStats
}

/**
 * Build the live, cached ApportionmentDeps for a real sizing run. Given the (max-contour)
 * isochrone it returns every intersecting block group with its B19001 histogram +
 * dasymetric block weights, serving fresh GEOIDs from the cache and fetching only the
 * misses. Misses are fetched by COUNTY (the natural batch: one B19001 + one DHC + a few
 * paginated TIGERweb centroid pages per county), with counties run in a bounded-concurrency
 * pool. This collapses a dense metro's ~1,600 per-block-group requests to a few dozen.
 * Freshly fetched block groups are written back to the cache. Integration only (SCOPE note).
 */
export function makeCensusTigerDeps(
  apiKey: string,
  opts?: { cache?: CensusCachePort; concurrency?: number },
): CensusTigerDeps {
  const cache = opts?.cache
  const limit = opts?.concurrency ?? CENSUS_FETCH_CONCURRENCY
  const stats: CensusTigerStats = {
    blockGroupsIntersecting: 0,
    cacheHits: 0,
    cacheMisses: 0,
    counties: 0,
    censusRequests: 0,
    censusMs: 0,
  }

  return {
    stats,
    async fetchIntersectingBlockGroups(isochrone: PolygonalGeometry): Promise<BlockGroupRecord[]> {
      if (!apiKey) throw new CensusTigerError(0, 'CENSUS_API_KEY is not set in the server environment')
      const started = Date.now()

      // 1. Precise server-side pre-clip: only block groups intersecting the isochrone.
      const intersecting = await fetchIntersectingBlockGroupIds(isochrone)
      stats.blockGroupsIntersecting = intersecting.length
      const allGeoids = intersecting.map((b) => b.geoid)

      // 2. Serve fresh block groups from the GEOID cache; fetch only the misses.
      const cached = cache ? await cache.read(allGeoids) : new Map<string, BlockGroupRecord>()
      stats.cacheHits = cached.size
      const missing = intersecting.filter((b) => !cached.has(b.geoid))
      stats.cacheMisses = missing.length

      const records: BlockGroupRecord[] = Array.from(cached.values())

      if (missing.length > 0) {
        // 3. Fetch each MISS county once (B19001 + DHC + paginated centroids), in parallel,
        //    and pre-group its blocks by their 12-digit block-group GEOID.
        const countyKeys = Array.from(new Set(missing.map((b) => b.geoid.slice(0, 5))))
        stats.counties = countyKeys.length

        const counties = await mapPool(countyKeys, limit, async (ck) => {
          const st = ck.slice(0, 2)
          const co = ck.slice(2, 5)
          const [b19001ByGeoid, dhc, centroids] = await Promise.all([
            fetchB19001ForCountyBGs(st, co, apiKey),
            fetchDhcHouseholdsForCounty(st, co, apiKey),
            fetchBlockCentroidsForCounty(st, co),
          ])
          const blocksByBg = new Map<string, BlockRecord[]>()
          for (const [blockGeoid, point] of Array.from(centroids.blocks)) {
            const bgGeoid = blockGeoid.slice(0, 12) // block GEOID[0..12) === its block-group GEOID
            const list = blocksByBg.get(bgGeoid) ?? []
            list.push({ households: dhc.get(blockGeoid) ?? 0, point })
            blocksByBg.set(bgGeoid, list)
          }
          return { ck, b19001ByGeoid, blocksByBg, requests: 2 + centroids.requests }
        })

        const countyData = new Map(counties.map((c) => [c.ck, c]))
        stats.censusRequests = 1 + counties.reduce((s, c) => s + c.requests, 0)

        // 4. Assemble fresh records from their county's data + write them back to the cache.
        const fresh: BlockGroupWithCentroid[] = []
        for (const b of missing) {
          const cd = countyData.get(b.geoid.slice(0, 5))
          if (!cd) continue
          const b19001 = cd.b19001ByGeoid.get(b.geoid)
          if (!b19001) continue // block group with no ACS row — skip (never counts as viable)
          const blocks = cd.blocksByBg.get(b.geoid) ?? []
          fresh.push({ geoid: b.geoid, stateFips: b.geoid.slice(0, 2), b19001, blocks, centroid: b.centroid })
        }
        records.push(...fresh)
        if (cache && fresh.length > 0) {
          try {
            await cache.upsert(fresh)
          } catch {
            // Cache write is best-effort; a failure never fails the sizing run.
          }
        }
      }

      stats.censusMs = Date.now() - started
      return records
    },
  }
}
