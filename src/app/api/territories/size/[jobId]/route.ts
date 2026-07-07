import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSizingJob } from '@/lib/territory-sizing-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/territories/size/{jobId} — poll a v3 sizing job.
 *
 * Returns { status, result?, error?, timing?, ...timestamps }. `result` is the full
 * SizeTerritoryOutcome (VIABLE minute + sized isochrone, or UNRESOLVED best-achieved)
 * only once status is 'succeeded'; `error` carries structured detail when 'failed'.
 * Minimal by design — no UI wiring here (that is the separate v3 authoring session).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } },
): Promise<NextResponse> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jobId = params.jobId
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 })
  }

  // Service-role-only table (RLS, no anon/authenticated policy).
  const job = await getSizingJob(createServiceClient(), jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    result: job.result ?? null,
    error: job.error ?? null,
    timing: job.timing ?? null,
    createdAt: job.created_at,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
  })
}
