import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { IsochroneCenter } from '@/lib/isochrone'
import { createSizingJob, triggerSizingJob } from '@/lib/territory-sizing-jobs'

// Reads cookies + writes the job row and triggers the worker — never static.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/territories/size — enqueue a v3 drive-time sizing job (§1.1).
 *
 * ASYNC MODEL (was synchronous, which 504'd on dense metros): this route no longer
 * computes. It creates a `territory_sizing_jobs` row (status 'queued'), fires the Netlify
 * Background Function that runs the optimized/cached compute out-of-band, and returns
 * 202 { jobId } immediately. Poll GET /api/territories/size/{jobId} for status + result.
 *
 * Body: { center: { lat, lng } }  OR  { territoryId: string }
 *   - center      : practice location to size around (ad-hoc; no territoryId needed).
 *   - territoryId : resolve center from territories + clip against SOLD siblings (§4.1).
 *
 * NON-WRITE BOUNDARY: even with a territoryId, the job only READS that territories row
 * (center + sold clip). It never writes territories.boundary_* — that is a separate,
 * later-authorized action.
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

  const hasCenter =
    !!body.center && Number.isFinite(body.center.lat) && Number.isFinite(body.center.lng)
  if (!hasCenter && !body.territoryId) {
    return NextResponse.json(
      { error: 'Provide { center: { lat, lng } } or a { territoryId }' },
      { status: 400 },
    )
  }

  // The jobs table is service-role-only (RLS, no anon/authenticated policy).
  const service = createServiceClient()

  let jobId: string
  try {
    ;({ jobId } = await createSizingJob(service, {
      center: hasCenter ? body.center : null,
      territoryId: body.territoryId ?? null,
      requestedBy: user.id,
    }))
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to enqueue sizing job', detail }, { status: 500 })
  }

  // Fire the out-of-band worker. Best-effort: on failure the job stays 'queued' and is
  // retriable; the client still gets its jobId and can poll.
  const trigger = await triggerSizingJob(jobId)

  return NextResponse.json({ jobId, status: 'queued', triggered: trigger.triggered }, { status: 202 })
}
