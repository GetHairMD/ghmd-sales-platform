import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { viewerIsExecutive } from '@/lib/auth/internal-role'
import { getSizingJob } from '@/lib/territory-sizing-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/territory-scouting/reports/{reportId} — read one scouting report plus the live
 * status/result of its sizing job. This is the poll target for the result panel; it mirrors
 * GET /api/territories/size/{jobId} structurally, but layered under the report and
 * executive-gated (that route is only authenticated-gated).
 *
 * The report row is read through the authenticated (RLS-protected) client — a non-executive
 * gets 0 rows (404 here), never a leak of existence. The job is read through the service
 * client because territory_sizing_jobs is service-role-only (RLS enabled, no policy).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { reportId: string } },
): Promise<NextResponse> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!(await viewerIsExecutive())) {
    return NextResponse.json({ error: 'Executive access required' }, { status: 403 })
  }

  const reportId = params.reportId
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) {
    return NextResponse.json({ error: 'Invalid report id' }, { status: 400 })
  }

  const { data: report } = await supabase
    .from('territory_scouting_reports')
    .select('id, label, center_lat, center_lng, location_label, sizing_job_id, created_at')
    .eq('id', reportId)
    .maybeSingle()
  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  // Live compute status. Service-role client (jobs table is service-role-only).
  const job = report.sizing_job_id
    ? await getSizingJob(createServiceClient(), report.sizing_job_id)
    : null

  return NextResponse.json({
    report: {
      id: report.id,
      label: report.label,
      location_label: report.location_label,
      center_lat: report.center_lat == null ? null : Number(report.center_lat),
      center_lng: report.center_lng == null ? null : Number(report.center_lng),
      sizing_job_id: report.sizing_job_id,
      created_at: report.created_at,
    },
    job: job
      ? { status: job.status, result: job.result ?? null, error: job.error ?? null }
      : null,
  })
}
