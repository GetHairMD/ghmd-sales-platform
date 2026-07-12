import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMapboxServerToken } from '@/lib/isochrone'
import { buildMapboxGeocodeUrl, parseGeocodeResponse } from '@/lib/geocode'

// Reads cookies (auth) + calls Mapbox — never static.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/geocode?q=<address> — forward-geocode an address to lat/lng candidates for
 * the New Territory flow. Server-side so it uses MAPBOX_SERVER_TOKEN (the browser
 * NEXT_PUBLIC token is referer-restricted to the deployed domain).
 *
 * Authenticated internal users only (same 401 posture as the sizing route). Returns
 * { candidates: [{ label, lat, lng }] }; an empty list is a normal "no matches" result.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 3) {
    return NextResponse.json(
      { error: 'Provide a ?q= address of at least 3 characters' },
      { status: 400 },
    )
  }

  let token: string
  try {
    token = requireMapboxServerToken()
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ error: 'Geocoding is not configured', detail }, { status: 500 })
  }

  let res: Response
  try {
    res = await fetch(buildMapboxGeocodeUrl(q, token))
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ error: 'Geocoding request failed', detail }, { status: 502 })
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `Geocoding provider returned ${res.status}` },
      { status: 502 },
    )
  }

  const json = await res.json()
  return NextResponse.json({ candidates: parseGeocodeResponse(json) })
}
