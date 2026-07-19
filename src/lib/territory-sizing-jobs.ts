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
import creditTable from '../../data/experian-credit-share-by-state.json'

export const SIZING_JOBS_TABLE = 'territory_sizing_jobs'

/** Background Function that runs the compute out-of-band (Netlify `-background` suffix). */
export const SIZING_BACKGROUND_FUNCTION = 'size-territory-background'

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

/** Read a job row by id (the poll path). Returns null when not found. */
export async function getSizingJob(
  client: SupabaseClient,
  jobId: string,
): Promise<SizingJobRow | null> {
  const { data, error } = await client
    .from(SIZING_JOBS_TABLE)
    .select(
      'id, status, input_center_lat, input_center_lng, input_territory_id, requested_by, result, error, timing, created_at, started_at, finished_at',
    )
    .eq('id', jobId)
    .maybeSingle()
  if (error || !data) return null
  return data as SizingJobRow
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
    const res = await fetch(`${origin}/.netlify/functions/${SIZING_BACKGROUND_FUNCTION}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SIZING_SECRET_HEADER]: secret },
      body: JSON.stringify({ jobId }),
      redirect: 'manual',
    })
    // A Background Function accepts the POST and returns 202. Treat only a real 2xx/202 as
    // triggered; surface anything else (redirect status, 4xx/5xx) in detail for observability.
    if (res.status === 202 || res.ok) return { triggered: true }
    return { triggered: false, detail: `background function returned HTTP ${res.status}` }
  } catch (err) {
    return { triggered: false, detail: err instanceof Error ? err.message : 'trigger fetch failed' }
  }
}
