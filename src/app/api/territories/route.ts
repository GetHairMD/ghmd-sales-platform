import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { viewerIsExecutive } from '@/lib/auth/internal-role'

// Reads cookies (auth gate) + writes a row — never static.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/territories — create a brand-new draft territory row (the one gap the v3
 * sizing UI didn't already cover). Executive-only, same in-code gate as the approve
 * route; the service-role client bypasses RLS, so authorization lives HERE, not in a
 * policy. Inserts status='draft' (schema-safe: territories.status has no CHECK
 * constraint) with formula_version left at its default (2) — a fresh row deterministically
 * resolves to PENDING_REVIEW, which renders V3SizingPanel mode="size" for execs. It never
 * calls the sizing API with an ad-hoc center; sizing is triggered later from
 * /territories/[id] via the territoryId path so sold-boundary clipping (§8.4) applies.
 *
 * Body: { name: string, center_lat: number, center_lng: number }
 * Returns: { id } of the new territory.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await viewerIsExecutive())) {
    return NextResponse.json({ error: 'Executive access required' }, { status: 403 })
  }

  let body: { name?: unknown; center_lat?: unknown; center_lng?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'Territory name is required' }, { status: 400 })
  }
  if (name.length > 120) {
    return NextResponse.json({ error: 'Territory name is too long' }, { status: 400 })
  }

  const lat = Number(body.center_lat)
  const lng = Number(body.center_lng)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return NextResponse.json({ error: 'center_lat must be between -90 and 90' }, { status: 400 })
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'center_lng must be between -180 and 180' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('territories')
    .insert({ name, center_lat: lat, center_lng: lng, status: 'draft' })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'Failed to create territory', detail: error?.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
