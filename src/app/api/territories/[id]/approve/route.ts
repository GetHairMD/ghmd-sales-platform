import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSizingJob } from '@/lib/territory-sizing-jobs'
import { viewerIsExecutive } from '@/lib/auth/internal-role'
import { parseSizingJobResult } from '@/lib/territories/v3-display'
import { geojsonFeatureToEwkt } from '@/lib/territories/boundary-ewkt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/territories/[id]/approve — promote a succeeded VIABLE sizing job into the
 * territory's persisted v3 boundary (brief §B, AC4/AC5).
 *
 * Executive-only. Writes exactly the five boundary_* / formula_version fields via the
 * service-role client; NEVER touches sold_boundary_geom (frozen at close, §4.2). Refuses on
 * sold/reserved status, on a non-VIABLE result (AC6), or on a job that is not for this
 * territory. The same endpoint serves both first approval and re-approval after a re-open —
 * approving again simply overwrites boundary_geom et al. (AC5, no new state).
 *
 * Body: { jobId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  // Server-side gate — the client control is a convenience; authorization lives here.
  if (!(await viewerIsExecutive())) {
    return NextResponse.json({ error: 'Executive access required' }, { status: 403 })
  }

  const territoryId = params.id
  if (!/^[0-9a-f-]{36}$/i.test(territoryId)) {
    return NextResponse.json({ error: 'Invalid territory id' }, { status: 400 })
  }

  let body: { jobId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const jobId = body.jobId
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: 'Provide a valid { jobId }' }, { status: 400 })
  }

  const service = createServiceClient()

  // Load + validate the job.
  const job = await getSizingJob(service, jobId)
  if (!job) return NextResponse.json({ error: 'Sizing job not found' }, { status: 404 })
  if (job.input_territory_id !== territoryId) {
    return NextResponse.json(
      { error: 'Sizing job does not belong to this territory' },
      { status: 409 },
    )
  }
  if (job.status !== 'succeeded') {
    return NextResponse.json(
      { error: `Sizing job is ${job.status}, not succeeded` },
      { status: 409 },
    )
  }

  const parsed = parseSizingJobResult(job.result)
  if (!parsed) {
    return NextResponse.json({ error: 'Sizing job has no readable result' }, { status: 422 })
  }
  if (parsed.status !== 'VIABLE' || !parsed.boundaryFeature || parsed.minutes == null) {
    // UNRESOLVED_BELOW_THRESHOLD_AT_CEILING (or a viable result missing its boundary) is not
    // approvable — it never produced a defensible boundary (AC6).
    return NextResponse.json(
      { error: 'Sizing result is not viable and cannot be approved' },
      { status: 422 },
    )
  }

  // Refuse to re-size a sold/reserved territory — that is a business act, not a UI decision.
  const { data: territory, error: tErr } = await service
    .from('territories')
    .select('id, status, qa_locked')
    .eq('id', territoryId)
    .maybeSingle()
  if (tErr || !territory) {
    return NextResponse.json({ error: 'Territory not found' }, { status: 404 })
  }
  // qa_locked anchors are protected #94 reference fixtures — approving a v3 boundary would
  // overwrite their locked formula_version + boundary data (same incident class as the
  // territories/[id] render-write fixed in PR #100). Refuse, same 409 shape as sold/reserved.
  if (territory.qa_locked) {
    return NextResponse.json(
      { error: 'Cannot approve a locked reference territory' },
      { status: 409 },
    )
  }
  if (territory.status === 'sold' || territory.status === 'reserved') {
    return NextResponse.json(
      { error: `Cannot approve a ${territory.status} territory` },
      { status: 409 },
    )
  }

  // Persist the five boundary fields. boundary_geom via EWKT (no RPC/migration); the GeoJSON
  // feature is kept verbatim for map render + the sold-clip union. sold_boundary_geom untouched.
  let ewkt: string
  try {
    ewkt = geojsonFeatureToEwkt(parsed.boundaryFeature)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ error: 'Boundary geometry is not polygonal', detail }, { status: 422 })
  }

  const boundary_source = {
    engine: 'v3-drive-time',
    boundary_minutes: parsed.minutes,
    // The addressable headline is kept here (one of the five persisted fields) so the approved
    // view renders without re-running the job — never on any UI as a minutes value (AC2).
    addressable: Math.max(0, Math.round(parsed.addressable)),
    promoted_from_job: jobId,
    provenance: (job.result as { provenance?: unknown } | null)?.provenance ?? null,
    timing: job.timing ?? null,
  }

  // A first-time approval of a freshly-created territory must move it OUT of 'draft', or it
  // stays permanently hidden from the national map (territory_status_map excludes drafts,
  // migration 20260711160000). Flip ONLY draft -> available; never overwrite any other status
  // (a V2_LEGACY territory sized under v3, or a re-approval of an already-available one, keeps
  // its current status). territory.status was loaded above for the sold/reserved guard — reuse it.
  const boundaryUpdate: {
    formula_version: number
    boundary_geom: string
    boundary_geojson: typeof parsed.boundaryFeature
    boundary_minutes: number
    boundary_source: typeof boundary_source
    status?: string
  } = {
    formula_version: 3,
    boundary_geom: ewkt,
    boundary_geojson: parsed.boundaryFeature,
    boundary_minutes: parsed.minutes,
    boundary_source,
  }
  if (territory.status === 'draft') {
    boundaryUpdate.status = 'available'
  }

  const { error: upErr } = await service
    .from('territories')
    .update(boundaryUpdate)
    .eq('id', territoryId)

  if (upErr) {
    return NextResponse.json(
      { error: 'Failed to persist boundary', detail: upErr.message },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    territoryId,
    addressable: parsed.addressable,
    formula_version: 3,
  })
}
