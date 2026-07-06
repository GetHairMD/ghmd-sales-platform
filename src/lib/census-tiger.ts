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
import { bboxOf, type BBox, type PolygonalGeometry, type Position } from './geometry'
import type { ApportionmentDeps, BlockGroupRecord, BlockRecord } from './polygon-apportionment'

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

// ─────────────────────────────────────────────────────────────────────────────
// Live network orchestration (integration — not run in CI)
// ─────────────────────────────────────────────────────────────────────────────

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new CensusTigerError(res.status, body.trim() || res.statusText)
  }
  return res.json()
}

/** Block groups whose geometry falls in the isochrone bbox (coarse envelope prefilter). */
async function fetchBlockGroupIdsInEnvelope(bbox: BBox): Promise<string[]> {
  const url = new URL(TIGERWEB_BG_LAYER)
  url.searchParams.set('geometry', bboxToEnvelope(bbox))
  url.searchParams.set('geometryType', 'esriGeometryEnvelope')
  url.searchParams.set('inSR', '4326')
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
  url.searchParams.set('outFields', 'GEOID')
  url.searchParams.set('returnGeometry', 'false')
  url.searchParams.set('f', 'json')
  const json = (await getJson(url.toString())) as { features?: Array<{ attributes?: { GEOID?: string } }> }
  return (json.features ?? []).map((f) => f.attributes?.GEOID ?? '').filter((g) => /^\d{12}$/.test(g))
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

/** Census blocks (centroid + household count) for one block group — dasymetric weight units. */
async function fetchBlocksForBlockGroup(geoid: string, apiKey: string): Promise<BlockRecord[]> {
  const { stateFips, countyFips, tract, blockGroup } = splitBlockGroupGeoid(geoid)

  // Block centroids from TIGERweb (blocks whose GEOID starts with the block-group GEOID).
  const tgUrl = new URL(TIGERWEB_BLOCKS_LAYER)
  tgUrl.searchParams.set('where', `GEOID LIKE '${geoid}%'`)
  tgUrl.searchParams.set('outFields', 'GEOID,CENTLON,CENTLAT')
  tgUrl.searchParams.set('returnGeometry', 'false')
  tgUrl.searchParams.set('f', 'json')
  const tg = (await getJson(tgUrl.toString())) as {
    features?: Array<{ attributes?: Record<string, unknown> }>
  }

  // Household counts per block from the 2020 DHC (H1_001N), one request per block group.
  const decUrl = new URL('https://api.census.gov/data/2020/dec/dhc')
  decUrl.searchParams.set('get', DEC_HOUSEHOLDS_VAR)
  decUrl.searchParams.set('for', 'block:*')
  decUrl.searchParams.set('in', `state:${stateFips} county:${countyFips} tract:${tract}`)
  decUrl.searchParams.set('key', apiKey)
  const decRows = parseCensusTable(await getJson(decUrl.toString()))
  const hhByBlockGeoid = new Map<string, number>()
  for (const row of decRows) {
    const blockGeoid = `${row.state}${row.county}${row.tract}${row.block}`
    if (row.block?.startsWith(blockGroup)) {
      const n = Number.parseInt(row[DEC_HOUSEHOLDS_VAR] ?? '', 10)
      hhByBlockGeoid.set(blockGeoid, Number.isFinite(n) && n >= 0 ? n : 0)
    }
  }

  const blocks: BlockRecord[] = []
  for (const f of tg.features ?? []) {
    const blockGeoid = String(f.attributes?.GEOID ?? '')
    const point = centroidOfArcgisFeature(f)
    if (!point) continue
    blocks.push({ households: hhByBlockGeoid.get(blockGeoid) ?? 0, point })
  }
  return blocks
}

/**
 * Build the live ApportionmentDeps for a real sizing run. Given an isochrone it returns
 * every intersecting block group with its B19001 histogram + dasymetric block weights.
 * Integration only — see the SCOPE / VERIFICATION NOTE at the top of this file.
 */
export function makeCensusTigerDeps(apiKey: string): ApportionmentDeps {
  return {
    async fetchIntersectingBlockGroups(isochrone: PolygonalGeometry): Promise<BlockGroupRecord[]> {
      if (!apiKey) throw new CensusTigerError(0, 'CENSUS_API_KEY is not set in the server environment')
      const bbox = bboxOf(isochrone)
      const geoids = await fetchBlockGroupIdsInEnvelope(bbox)

      // Group by county to batch the ACS B19001 fetch (one request per county).
      const byCounty = new Map<string, string[]>()
      for (const geoid of geoids) {
        const { stateFips, countyFips } = splitBlockGroupGeoid(geoid)
        const key = `${stateFips}${countyFips}`
        const list = byCounty.get(key) ?? []
        list.push(geoid)
        byCounty.set(key, list)
      }

      const records: BlockGroupRecord[] = []
      for (const [countyKey, countyGeoids] of Array.from(byCounty.entries())) {
        const stateFips = countyKey.slice(0, 2)
        const countyFips = countyKey.slice(2, 5)
        const histByGeoid = await fetchB19001ForCountyBGs(stateFips, countyFips, apiKey)
        for (const geoid of countyGeoids) {
          const b19001 = histByGeoid.get(geoid)
          if (!b19001) continue
          const blocks = await fetchBlocksForBlockGroup(geoid, apiKey)
          records.push({ geoid, stateFips, b19001, blocks })
        }
      }
      return records
    },
  }
}
