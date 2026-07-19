/**
 * Async v3 drive-time sizing — job lifecycle (enqueue / run / poll / trigger).
 *
 * This is the SINGLE code path shared by every entry point, so the compute logic exists
 * once:
 *   • POST /api/territories/size            → createSizingJob + triggerSizingJob (202)
 *   • GET  /api/territories/size/[jobId]     → getSizingJob (poll)
 *   • netlify/functions/size-territory-background → runSizingJob (out-of-band compute)
 *   • scripts/verify-territory-sizing.ts     → createSizingJob → runSizingJob → getSizingJob
 *
 * The compute (runSizingJob) is where Part 1's optimized, cached, parallelized data layer
 * actually executes. It runs out-of-band precisely because a dense metro's block-group
 * fetch can exceed a synchronous serverless timeout — the whole reason POST used to 504.
 *
 * NON-WRITE BOUNDARY (brief, hard rule): the job stores its computed payload in the job
 * row's `result` ONLY. Even when a territoryId is supplied, this module READS that
 * territories row (to resolve the center + sold-sibling clip) but NEVER writes
 * territories.boundary_geom / boundary_minutes / sold_boundary_geom / etc. Promoting a
 * job result into a territories row is a separate, later-authorized action.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchIsochroneContours, type IsochroneCenter } from './isochrone'
import { makeCensusTigerDeps, type CensusTigerStats } from './census-tiger'
import { sizeDriveTimeTerritory } from './territory-sizing-v3'
import { readFreshBlockGroups, upsertBlockGroups } from './census-bg-cache'
import type { PolygonalGeometry } from './geometry'
import { SIZING_SECRET_ENV, SIZING_SECRET_HEADER } from './sizing-function-auth'
import { createServiceClient } from './supabase/service'
import creditTable from '../../data/experian-credit-share-by-state.json'

export const SIZING_JOBS_TABLE = 'territory_sizing_jobs'

/** Background Function that runs the compute out-of-band (Netlify `-background` suffix). */
export const SIZING_BACKGROUND_FUNCTION = 'size-territory-background'

/**
 * `detail` returned alongside `triggered: true`. Says what a 202 actually means:
 * the platform accepted the invocation. It is NOT confirmation that the function
 * ran, nor that it authenticated — Background Functions ack before executing and
 * discard the handler's Response. Pinned in tests so the honesty can't regress.
 */
export const TRIGGER_ACCEPTED_DETAIL =
  'invocation accepted (202); execution and auth not confirmed by the response'

export interface SizingJobInput {
  center?: IsochroneCenter | null
  territoryId?: string | null
  requestedBy?: string | null
}

export type SizingJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface SizingJobRow {
  id: string
  status: SizingJobStatus
  input_center_lat: number | null
  input_center_lng: number | null
  input_territory_id: string | null
  requested_by: string | null
  result: unknown | null
  error: { message: string; detail?: string; name?: string } | null
  timing: (Partial<CensusTigerStats> & { totalMs?: number; isochroneReady?: boolean }) | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Enqueue / poll
// ─────────────────────────────────────────────────────────────────────────────

/** Insert a queued job row and return its id. Caller has already validated the input. */
export async function createSizingJob(
  client: SupabaseClient,
  input: SizingJobInput,
): Promise<{ jobId: string }> {
  const insert: Record<string, unknown> = {
    status: 'queued',
    requested_by: input.requestedBy ?? null,
  }
  if (input.territoryId) insert.input_territory_id = input.territoryId
  if (input.center && Number.isFinite(input.center.lat) && Number.isFinite(input.center.lng)) {
    insert.input_center_lat = input.center.lat
    insert.input_center_lng = input.center.lng
  }

  const { data, error } = await client
    .from(SIZING_JOBS_TABLE)
    .insert(insert)
    .select('id')
    .single()
  if (error || !data) {
    throw new Error(`Failed to enqueue sizing job: ${error?.message ?? 'no row returned'}`)
  }
  return { jobId: (data as { id: string }).id }
}

const JOB_COLUMNS =
  'id, status, input_center_lat, input_center_lng, input_territory_id, requested_by, result, error, timing, created_at, started_at, finished_at'

/**
 * How long a job may sit at 'queued' before a read treats it as never-started.
 *
 * Safely conservative. `runSizingJob` claims the row — queued → running, stamping
 * `started_at` — as its FIRST action, before resolving inputs or calling anything
 * external. So a job that ever began executing is 'running', never 'queued', and a
 * long compute (a dense metro can run for minutes) cannot false-positive here: it
 * left 'queued' within milliseconds of starting. The trigger fires the function
 * within seconds of enqueue, so five minutes is orders of magnitude of headroom.
 */
export const SIZING_STALE_QUEUED_MS = 5 * 60 * 1000

/** Operator-facing explanation stamped on a stale-queued job. Pinned in tests. */
export const STALE_QUEUED_DETAIL =
  'trigger not confirmed — job never started (possible sizing secret mismatch or function failure)'

/**
 * Has this job been sitting at 'queued' long enough to conclude it never started?
 *
 * Pure, so the boundary is exhaustively testable. Only ever true for 'queued' —
 * running/succeeded/failed rows are never candidates.
 */
export function isStaleQueued(job: SizingJobRow, nowMs: number): boolean {
  if (job.status !== 'queued') return false
  const queuedAtMs = Date.parse(job.created_at)
  if (!Number.isFinite(queuedAtMs)) return false
  // INCLUSIVE (>=), not exclusive. The contract is "operator-visible as failed
  // WITHIN 5 minutes"; with a strict `>` a read at exactly the deadline returned
  // 'queued' and deferred failure to an unspecified later read, so the code was
  // marginally outside its own guarantee (Second-Opinion Gate finding, PR #151).
  // Inclusivity adds no false-positive risk: a job sitting at exactly the
  // threshold is every bit as stale as one a millisecond past it.
  return nowMs - queuedAtMs >= SIZING_STALE_QUEUED_MS
}

/**
 * Read a job row by id (the poll path). Returns null when not found.
 *
 * ── STALE-QUEUED WATCHDOG (Second-Opinion Gate finding, PR #151) ─────────────
 * Netlify Background Functions 202-acknowledge before executing and discard the
 * handler's Response, so `triggerSizingJob` cannot observe an auth refusal (or any
 * other handler-level failure). Without this, a refused invocation leaves the job
 * at 'queued' FOREVER while the caller was told `triggered: true` — invisible
 * unless someone reads Netlify function logs. That is the exact silent-stall shape
 * this module already has P0 history with.
 *
 * This closes it at READ time, lazily — no scheduler, no new infrastructure. Every
 * status read in the app funnels through this function (the poll endpoint, the
 * approve route, the scouting-report route, the verify script), so placing the
 * detection here covers all of them at once rather than at four call sites.
 *
 * Marking the row 'failed' (rather than computing a transient flag) is deliberate:
 * it makes the existing retry UX work — a failed job is re-runnable, whereas a
 * cosmetic flag would leave the row stuck at 'queued' and un-actionable.
 *
 * SAFETY PROPERTIES:
 *  • Guarded: the UPDATE matches `.eq('status','queued')`, so it can only ever move
 *    a still-queued row. A job that starts concurrently is claimed by
 *    `runSizingJob` and this write no-ops.
 *  • Idempotent under concurrent polls: two simultaneous readers both filter on
 *    'queued'; the loser updates zero rows and simply re-reads.
 *  • Non-fatal: any failure of the watchdog write is swallowed and the original row
 *    returned. A monitoring convenience must never break the read path.
 *  • Involves no secret. It infers nothing about *why* the job never started.
 *  • `runSizingJob` calls this function internally right after claiming the row,
 *    when status is already 'running' — so the watchdog cannot interfere with a
 *    job that is legitimately executing.
 */
export async function getSizingJob(
  client: SupabaseClient,
  jobId: string,
  nowMs: number = Date.now(),
): Promise<SizingJobRow | null> {
  const { data, error } = await client
    .from(SIZING_JOBS_TABLE)
    .select(JOB_COLUMNS)
    .eq('id', jobId)
    .maybeSingle()
  if (error || !data) return null

  const job = data as SizingJobRow
  if (!isStaleQueued(job, nowMs)) return job

  try {
    const stamped = new Date(nowMs).toISOString()

    // The watchdog WRITE always goes through the service client, whatever client
    // the READ used. Every caller is server-side, and the read has already proven
    // this row is stale-queued, so the escalation is narrowly scoped: one guarded
    // UPDATE on one row already established to need it.
    //
    // Why not inherit the caller's client: RLS is enabled on this table with ZERO
    // policies, so a non-service client's UPDATE is denied — and PostgREST reports
    // that denial in `error` WITHOUT throwing, which is exactly the silent-stall
    // the Second-Opinion Gate caught. All four read paths happen to pass the
    // service client today; routing the write explicitly PINS that property here
    // instead of inheriting it from call-site discipline that a future caller
    // could quietly break.
    const writeClient = createServiceClient()

    const { data: updated, error: updateError } = await writeClient
      .from(SIZING_JOBS_TABLE)
      .update({
        status: 'failed',
        error: { message: 'Sizing job never started', detail: STALE_QUEUED_DETAIL },
        finished_at: stamped,
        updated_at: stamped,
      })
      .eq('id', jobId)
      // Only a still-queued row transitions — never clobbers a job that just started.
      .eq('status', 'queued')
      .select(JOB_COLUMNS)

    // FAILURE and RACE are different worlds and must not share a branch.
    //
    // supabase-js returns API/RLS/database errors in `error` and does NOT throw, so
    // the try/catch below never sees them. Conflating "write failed" with "someone
    // else won the race" is what let a persistent failure re-read, return the
    // still-queued row, and leave the job stuck forever — silently under-delivering
    // the five-minute guarantee this watchdog exists to provide.
    if (updateError) {
      console.error(
        `[sizing-watchdog] failed to mark stale job ${jobId} as failed: ${updateError.message}`,
      )
      // Deliberately do NOT fall through to the race re-read: there is no winner to
      // re-read, and doing so would disguise a hard failure as a benign race.
      return job
    }

    if (updated && updated.length > 0) return updated[0] as SizingJobRow

    // No error and zero rows = a GENUINE race (another poll marked it, or
    // runSizingJob claimed it). Re-read so the caller sees authoritative state
    // rather than our stale copy.
    const { data: fresh } = await client
      .from(SIZING_JOBS_TABLE)
      .select(JOB_COLUMNS)
      .eq('id', jobId)
      .maybeSingle()
    return (fresh as SizingJobRow | null) ?? job
  } catch (err) {
    // Outer backstop for genuinely THROWN faults (network, client construction).
    // It no longer masks non-throwing failures — those are handled explicitly above.
    console.error(
      `[sizing-watchdog] threw while marking stale job ${jobId}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return job
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Center + sold-clip resolution (READS territories; never writes)
// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedInput {
  center: IsochroneCenter
  soldUnion: PolygonalGeometry | null
}

/**
 * Resolve the compute inputs from a job row, mirroring the original synchronous route:
 * a territoryId resolves the center from territories and unions the OTHER territories'
 * frozen sold boundaries to clip against (§4.1 first-sold precedence); an ad-hoc center
 * is used directly. READ-ONLY against territories.
 */
async function resolveInput(client: SupabaseClient, job: SizingJobRow): Promise<ResolvedInput> {
  if (job.input_territory_id) {
    const { data: territory, error } = await client
      .from('territories')
      .select('id, center_lat, center_lng')
      .eq('id', job.input_territory_id)
      .single()
    if (error || !territory) throw new Error('Territory not found')
    if (territory.center_lat == null || territory.center_lng == null) {
      throw new Error('Territory has no center coordinates')
    }

    const { data: sold } = await client
      .from('territories')
      .select('id, boundary_geojson, sold_boundary_geom')
      .neq('id', job.input_territory_id)
      .not('sold_boundary_geom', 'is', null)
    const features = (sold ?? [])
      .map((r: { boundary_geojson: unknown }) => r.boundary_geojson)
      .filter((g): g is GeoJSON.Feature => !!g && typeof g === 'object')
    const soldUnion: PolygonalGeometry | null =
      features.length > 0
        ? ({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection)
        : null

    return { center: { lat: Number(territory.center_lat), lng: Number(territory.center_lng) }, soldUnion }
  }

  if (job.input_center_lat != null && job.input_center_lng != null) {
    return { center: { lat: Number(job.input_center_lat), lng: Number(job.input_center_lng) }, soldUnion: null }
  }
  throw new Error('Job has neither a center nor a resolvable territoryId')
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute (out-of-band worker)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one sizing job to terminal state. Idempotency-guarded: claims the row by moving
 * queued → running and no-ops if another worker already claimed it. On success writes the
 * full SizeTerritoryOutcome + provenance + per-leg timing; on failure writes structured
 * error detail. Never writes to territories (non-write boundary).
 *
 * @returns the terminal status written ('succeeded' | 'failed'), or 'skipped' if the job
 *          was already claimed / not queued.
 */
export async function runSizingJob(
  client: SupabaseClient,
  jobId: string,
): Promise<'succeeded' | 'failed' | 'skipped'> {
  // Claim: only a queued job transitions to running (guards double-invocation).
  const { data: claimed } = await client
    .from(SIZING_JOBS_TABLE)
    .update({ status: 'running', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select('id')
  if (!claimed || claimed.length === 0) return 'skipped'

  const job = await getSizingJob(client, jobId)
  if (!job) return 'skipped'

  const startedMs = Date.now()
  const censusDeps = makeCensusTigerDeps(process.env.CENSUS_API_KEY ?? '', {
    cache: {
      read: (geoids) => readFreshBlockGroups(client, geoids),
      upsert: (records) => upsertBlockGroups(client, records),
    },
  })

  try {
    const { center, soldUnion } = await resolveInput(client, job)

    const outcome = await sizeDriveTimeTerritory(center, {
      fetchContours: (c, minutes) => fetchIsochroneContours(c, minutes),
      apportionment: censusDeps,
      creditTable: creditTable as { states: Record<string, number> },
      soldUnion,
    })

    const timing = {
      totalMs: Date.now() - startedMs,
      ...censusDeps.stats,
    }
    const provenance = {
      engine: 'v3-drive-time',
      soldClipped: !!soldUnion,
      center,
      computed_at: new Date().toISOString(),
    }

    await client
      .from(SIZING_JOBS_TABLE)
      .update({
        status: 'succeeded',
        result: { ...outcome, provenance },
        timing,
        error: null,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    return 'succeeded'
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const name = err instanceof Error ? err.name : undefined
    const detail = (err as { detail?: string })?.detail
    await client
      .from(SIZING_JOBS_TABLE)
      .update({
        status: 'failed',
        error: { message, ...(name ? { name } : {}), ...(detail ? { detail } : {}) },
        timing: { totalMs: Date.now() - startedMs, ...censusDeps.stats },
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    return 'failed'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger (production: fire the Netlify Background Function)
// ─────────────────────────────────────────────────────────────────────────────

/** Site origin for the internal background-function call (Netlify-provided at runtime). */
function siteOrigin(): string | null {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    null
  )
}

/**
 * Fire-and-forget the Background Function that runs `runSizingJob(jobId)` out-of-band.
 * Netlify Background Functions accept the POST and return 202 immediately, continuing to
 * run for up to 15 minutes — well past any synchronous request budget. Best-effort: a
 * trigger error is surfaced to the caller (the job stays 'queued' and is retriable), never
 * thrown into the client response.
 */
export async function triggerSizingJob(jobId: string): Promise<{ triggered: boolean; detail?: string }> {
  const origin = siteOrigin()
  if (!origin) return { triggered: false, detail: 'no site origin env (URL/DEPLOY_PRIME_URL) available' }

  // PR-0a.1 (#181): the Background Function now requires a shared secret. This is
  // the ONLY code path that HTTP-POSTs it — both callers (POST /api/territories/size
  // and POST /api/territory-scouting/reports) funnel through here — so the header
  // is attached once, at the single chokepoint.
  //
  // Server-only: this module is imported exclusively by route handlers and the
  // function itself, and the variable is deliberately NOT NEXT_PUBLIC_-prefixed,
  // so Next cannot inline it into a client bundle.
  //
  // If the secret is unprovisioned we do NOT send the header — the function will
  // answer 503 and the job stays 'queued' and retriable, which is the same
  // observable failure shape as any other trigger failure. Failing closed here
  // matches the function side; it never silently proceeds unauthenticated.
  const secret = process.env[SIZING_SECRET_ENV]
  if (!secret) {
    return { triggered: false, detail: 'sizing function secret not provisioned' }
  }

  try {
    // `redirect: 'manual'` is load-bearing: this internal call re-enters the site through
    // Netlify's edge. If anything (e.g. the app auth middleware) redirects the path, we must
    // SEE it as a non-2xx here rather than have fetch transparently follow it to /login and
    // report a bogus success — the failure mode that left jobs stuck 'queued' invisibly.
    //
    // ⚠ SCOPE OF THE STATUS CHECK BELOW (Second-Opinion Gate finding, PR #151).
    // The non-2xx check catches EDGE-level failures only — redirects, 404s, a missing
    // function. It CANNOT observe handler-level outcomes: Netlify Background Functions
    // 202-acknowledge the invocation *before* executing and then discard whatever the
    // handler returns. So the handler's 401 (bad secret) and 503 (unprovisioned) never
    // reach this code — a refused invocation is indistinguishable here from a successful
    // one. Do not add logic that tries to read an auth outcome from this response; there
    // is nothing to read.
    //
    // The residual silent-failure window that creates — triggered, refused, job sits at
    // 'queued' forever — is closed at READ time by the stale-queued watchdog in
    // `getSizingJob`, not here.
    const res = await fetch(`${origin}/.netlify/functions/${SIZING_BACKGROUND_FUNCTION}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SIZING_SECRET_HEADER]: secret },
      body: JSON.stringify({ jobId }),
      redirect: 'manual',
    })
    // A Background Function accepts the POST and returns 202. Treat only a real 2xx/202 as
    // triggered; surface anything else (redirect status, 4xx/5xx) in detail for observability.
    //
    // `triggered: true` here means ACCEPTED FOR INVOCATION — not "ran", and not
    // "authenticated". See the scope note above: the platform's 202 precedes execution and
    // hides the handler's verdict. The detail string says so explicitly so no caller (or
    // future reader) mistakes this for confirmation that the job actually started.
    if (res.status === 202 || res.ok) {
      return { triggered: true, detail: TRIGGER_ACCEPTED_DETAIL }
    }
    return { triggered: false, detail: `background function returned HTTP ${res.status}` }
  } catch (err) {
    return { triggered: false, detail: err instanceof Error ? err.message : 'trigger fetch failed' }
  }
}
