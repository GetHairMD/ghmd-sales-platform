import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { viewerIsExecutive } from '@/lib/auth/internal-role'
import { parseApiCoordinate } from '@/lib/geocode'
import { createSizingJob, triggerSizingJob } from '@/lib/territory-sizing-jobs'
import { parseSizingJobResult } from '@/lib/territories/v3-display'

// Reads cookies (auth gate) + writes rows and triggers the worker — never static.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Territory Scouting reports (decision #146) — executive-only, deal-independent.
 *
 * The v3 sizing engine is reused via its LIBRARY functions (createSizingJob /
 * triggerSizingJob), never by fetch()-ing /api/territories/size* — those routes are only
 * authenticated-gated, not executive-gated, and would be the wrong authorization surface.
 * The jobs table is service-role-only (RLS enabled, no policy), so the executive gate lives
 * IN CODE here; the scouting-report row itself is written through the ordinary authenticated
 * SSR client and gated by its exec_all RLS policy.
 */

const LABEL_MAX = 120
const LOCATION_LABEL_MAX = 300

interface ScoutingReportRow {
  id: string
  label: string | null
  center_lat: number | string | null
  center_lng: number | string | null
  location_label: string | null
  sizing_job_id: string | null
  created_at: string
}

/** Compact per-report compute summary for the list view (avoids shipping full isochrone geometry). */
function summarizeJob(status: string | null, rawResult: unknown) {
  if (status !== 'succeeded') return { jobStatus: status, addressable: null as number | null, viable: null as boolean | null }
  const parsed = parseSizingJobResult(rawResult)
  if (!parsed) return { jobStatus: status, addressable: null, viable: null }
  return {
    jobStatus: status,
    addressable: Math.round(parsed.addressable),
    viable: parsed.status === 'VIABLE' && !!parsed.boundaryFeature,
  }
}

function coordNumber(v: number | string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * POST /api/territory-scouting/reports — scout a location: enqueue an ad-hoc v3 sizing job,
 * record the exec-readable report row referencing it, and fire the background compute.
 *
 * Body: { center: { lat, lng }, label?, location_label? }
 * Returns: { reportId, jobId, status: 'queued' } at 202.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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

  let body: { center?: unknown; label?: unknown; location_label?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // center is a nested object; parseApiCoordinate guards the Number() coercion trap where
  // null/false/[]/'' silently become 0 and would otherwise create a report at (0,0).
  const center =
    body.center && typeof body.center === 'object'
      ? (body.center as { lat?: unknown; lng?: unknown })
      : null
  const lat = parseApiCoordinate(center?.lat, -90, 90)
  const lng = parseApiCoordinate(center?.lng, -180, 180)
  if (lat === null) {
    return NextResponse.json({ error: 'center.lat must be a number between -90 and 90' }, { status: 400 })
  }
  if (lng === null) {
    return NextResponse.json({ error: 'center.lng must be a number between -180 and 180' }, { status: 400 })
  }

  const label =
    typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, LABEL_MAX) : null
  const locationLabel =
    typeof body.location_label === 'string' && body.location_label.trim()
      ? body.location_label.trim().slice(0, LOCATION_LABEL_MAX)
      : null

  // 1. Enqueue the ad-hoc sizing job via the service client (jobs table is service-role-only).
  //    NEVER pass a territoryId — scouting is always ad-hoc (decision #146).
  const service = createServiceClient()
  let jobId: string
  try {
    ;({ jobId } = await createSizingJob(service, { center: { lat, lng }, requestedBy: user.id }))
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to enqueue sizing job', detail }, { status: 500 })
  }

  // 2. Insert the report row through the authenticated (RLS-protected) client — the exec_all
  //    WITH CHECK gates this, defense-in-depth on top of the in-code gate above.
  const { data: report, error: insertError } = await supabase
    .from('territory_scouting_reports')
    .insert({
      label,
      center_lat: lat,
      center_lng: lng,
      location_label: locationLabel,
      sizing_job_id: jobId,
      requested_by: user.id,
    })
    .select('id')
    .single()
  if (insertError || !report) {
    return NextResponse.json(
      { error: 'Failed to create scouting report', detail: insertError?.message },
      { status: 500 },
    )
  }

  // 3. Fire the out-of-band worker. Best-effort: on failure the job stays 'queued' and is
  //    retriable; the report still exists and can be re-triggered later. Never a hard error.
  const trigger = await triggerSizingJob(jobId)

  return NextResponse.json(
    { reportId: report.id, jobId, status: 'queued', triggered: trigger.triggered },
    { status: 202 },
  )
}

/**
 * GET /api/territory-scouting/reports — list the executive's scouting reports (RLS scopes
 * this to executive viewers; v1 has exactly one executive). Enriched with a compact job
 * summary so the list can show status/addressable without shipping full isochrone geometry
 * or forcing a per-row poll.
 */
export async function GET(): Promise<NextResponse> {
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

  const { data, error } = await supabase
    .from('territory_scouting_reports')
    .select('id, label, center_lat, center_lng, location_label, sizing_job_id, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    return NextResponse.json({ error: 'Failed to load scouting reports', detail: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as ScoutingReportRow[]

  // Batch-read the linked jobs (service-role-only table) in one query, then attach a compact
  // summary to each report. Avoids an N+1 of per-report job reads.
  const jobIds = rows.map((r) => r.sizing_job_id).filter((id): id is string => !!id)
  const jobById = new Map<string, { status: string; result: unknown }>()
  if (jobIds.length > 0) {
    const service = createServiceClient()
    const { data: jobs } = await service
      .from('territory_sizing_jobs')
      .select('id, status, result')
      .in('id', jobIds)
    for (const j of (jobs ?? []) as { id: string; status: string; result: unknown }[]) {
      jobById.set(j.id, { status: j.status, result: j.result })
    }
  }

  const reports = rows.map((r) => {
    const job = r.sizing_job_id ? jobById.get(r.sizing_job_id) : undefined
    return {
      id: r.id,
      label: r.label,
      location_label: r.location_label,
      center_lat: coordNumber(r.center_lat),
      center_lng: coordNumber(r.center_lng),
      sizing_job_id: r.sizing_job_id,
      created_at: r.created_at,
      ...summarizeJob(job?.status ?? null, job?.result ?? null),
    }
  })

  return NextResponse.json({ reports })
}
