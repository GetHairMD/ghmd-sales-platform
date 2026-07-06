import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchIsochroneContours, IsochroneError, type IsochroneCenter } from '@/lib/isochrone'
import { makeCensusTigerDeps } from '@/lib/census-tiger'
import { sizeDriveTimeTerritory } from '@/lib/territory-sizing-v3'
import type { PolygonalGeometry } from '@/lib/geometry'
import creditTable from '../../../../../data/experian-credit-share-by-state.json'

// Reads cookies + server env and hits Mapbox/Census — never static.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/territories/size — v3 drive-time sizing engine (server-side, §1.1).
 *
 * Body: { center: { lat, lng } }  OR  { territoryId: string }
 *   - center      : practice location to size around.
 *   - territoryId : resolve center from territories; also clip against SOLD sibling
 *                   boundaries (first-sold precedence, §4.1).
 *
 * Returns the typed V3 sizing result (VIABLE with the smallest viable minute + sized
 * isochrone GeoJSON, or UNRESOLVED_BELOW_THRESHOLD_AT_CEILING with the best achieved).
 * This endpoint COMPUTES and does not mutate territories — persisting boundary_geom /
 * freezing sold_boundary_geom is authoring-flow (UI wiring, out of scope this session).
 *
 * Requires MAPBOX_SERVER_TOKEN (Trace-provisioned) + CENSUS_API_KEY. The live
 * census/TIGER data path is integration-level — see census-tiger.ts scope note.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { center?: IsochroneCenter; territoryId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Resolve the center and (for a territoryId) the sold-sibling union to clip against.
  let center = body.center
  let soldUnion: PolygonalGeometry | null = null

  if (body.territoryId) {
    const { data: territory, error } = await supabase
      .from('territories')
      .select('id, center_lat, center_lng')
      .eq('id', body.territoryId)
      .single()
    if (error || !territory) {
      return NextResponse.json({ error: 'Territory not found' }, { status: 404 })
    }
    if (territory.center_lat == null || territory.center_lng == null) {
      return NextResponse.json({ error: 'Territory has no center coordinates' }, { status: 422 })
    }
    center = { lat: Number(territory.center_lat), lng: Number(territory.center_lng) }

    // Sold-sibling boundaries: any OTHER territory with a frozen sold boundary. We read
    // the GeoJSON render copy (boundary_geojson), which mirrors the frozen sold geometry
    // for a sold v3 territory; the authoritative geometry is sold_boundary_geom.
    const { data: sold } = await supabase
      .from('territories')
      .select('id, boundary_geojson, sold_boundary_geom')
      .neq('id', body.territoryId)
      .not('sold_boundary_geom', 'is', null)
    const features = (sold ?? [])
      .map((r) => r.boundary_geojson)
      .filter((g): g is GeoJSON.Feature => !!g && typeof g === 'object')
    if (features.length > 0) {
      soldUnion = { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection
    }
  }

  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    return NextResponse.json(
      { error: 'Provide { center: { lat, lng } } or a { territoryId } with center coordinates' },
      { status: 400 },
    )
  }

  const censusApiKey = process.env.CENSUS_API_KEY ?? ''

  try {
    const outcome = await sizeDriveTimeTerritory(center, {
      fetchContours: (c, minutes) => fetchIsochroneContours(c, minutes),
      apportionment: makeCensusTigerDeps(censusApiKey),
      creditTable: creditTable as { states: Record<string, number> },
      soldUnion,
    })
    return NextResponse.json(outcome)
  } catch (err) {
    if (err instanceof IsochroneError) {
      return NextResponse.json(
        { error: 'Isochrone provider error', detail: err.detail, status: err.status },
        { status: 502 },
      )
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to size territory', detail: message }, { status: 500 })
  }
}
