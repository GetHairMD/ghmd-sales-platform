/**
 * Netlify Background Function — out-of-band v3 drive-time sizing compute.
 *
 * The `-background` filename suffix makes this a Netlify Background Function: it accepts
 * the POST, returns 202 immediately, and keeps running for up to 15 minutes — far past any
 * synchronous request budget, which is exactly why the sizing compute moved here (a dense
 * metro's block-group fetch can exceed a normal serverless timeout, the old 504).
 *
 * POST /.netlify/functions/size-territory-background  body: { jobId }
 *
 * It runs the SAME shared `runSizingJob` the enqueue route / verify script use, against a
 * service-role Supabase client. All optimization (GEOID cache, polygon pre-clip, bounded
 * parallel fetch, DHC tract dedup, superset-once) lives in that shared path. This wrapper
 * only bridges the HTTP trigger to it. Deploy env supplies CENSUS_API_KEY,
 * MAPBOX_SERVER_TOKEN, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * NON-WRITE BOUNDARY: runSizingJob writes only the job row; never territories.boundary_*.
 */

import { createServiceClient } from '../../src/lib/supabase/service'
import { runSizingJob } from '../../src/lib/territory-sizing-jobs'
import { SIZING_SECRET_HEADER, authorizeSizingRequest } from '../../src/lib/sizing-function-auth'

// This is a modern Netlify Function (ESM `.mts`, `export default`): it is invoked with the
// Web `Request` API — NOT the legacy `(event)` lambda shape whose `event.body` was a string.
// The previous `event.body` read never yielded a jobId under the v2 runtime. We type only
// `Request` (a global) because @netlify/functions is not a dependency and the app tsconfig
// does not compile .mts. A Background Function's response is ignored (Netlify returns 202).
export default async function handler(req: Request): Promise<Response> {
  // ── AUTH GATE (PR-0a.1, decision-log #181) ────────────────────────────────
  // MUST be the first thing in this handler. Netlify Background Functions are
  // publicly invocable at /.netlify/functions/<name>, and the app middleware
  // cannot protect this path — its matcher excludes `.netlify` deliberately
  // (removing that exclusion is what caused the P0 where every sizing job stuck
  // at 'queued'). Without this check, any unauthenticated caller with a valid
  // job UUID could trigger billable Census/Mapbox compute against a SERVICE-ROLE
  // client and overwrite that job row.
  //
  // ⚠ ORDERING IS LOAD-BEARING: this runs before the body is parsed, before any
  // job-row read, before createServiceClient(), and before any external API
  // call. An unauthorized request must cost us nothing and touch nothing.
  //
  // Fails closed both ways: 503 when the secret is unprovisioned (never
  // degrades to "no auth required"), 401 on absent/wrong header. Neither
  // response reveals the secret, the header name's expected value, or which
  // check failed beyond a generic reason code.
  //
  // ⚠ WHAT THE 401/503 ACTUALLY DO WHEN DEPLOYED (Second-Opinion Gate, PR #151).
  // Nothing. Netlify Background Functions 202-acknowledge the invocation BEFORE
  // executing this handler and then DISCARD whatever Response it returns — see
  // the note at the top of this file. So no deployed caller ever observes these
  // status codes; they are unit-test-facing semantics only, and they document
  // intent for the next reader.
  //
  // The DEPLOYED protection is refusal-to-execute: returning early here means the
  // sizing compute, the service-role client, and every external API call simply
  // never happen. That is the real security property, and it is unaffected by the
  // response being swallowed — an attacker gets 202 either way and learns nothing.
  //
  // The one deployed-visible signal is the console.warn below (Netlify function
  // logs). Because logs are a poor operational tripwire, the silent-stall window
  // this creates — invoked, refused, job sits at 'queued' forever — is closed at
  // READ time by the stale-queued watchdog in `getSizingJob`.
  const auth = authorizeSizingRequest(req.headers.get(SIZING_SECRET_HEADER))
  if (!auth.ok) {
    if (auth.status === 503) {
      console.warn(
        '[size-territory-background] refusing: shared secret is not provisioned (blocked-pending-provisioning).',
      )
    } else {
      console.warn('[size-territory-background] refusing: unauthorized request.')
    }
    return new Response(JSON.stringify({ ok: false, reason: auth.reason }), {
      status: auth.status,
      headers: { 'content-type': 'application/json' },
    })
  }

  let jobId: string | undefined
  try {
    const body = (await req.json()) as { jobId?: string } | null
    jobId = body?.jobId
  } catch {
    console.error('[size-territory-background] invalid JSON body')
    return new Response(null, { status: 400 })
  }
  if (!jobId) {
    console.error('[size-territory-background] missing jobId')
    return new Response(null, { status: 400 })
  }

  try {
    const outcome = await runSizingJob(createServiceClient(), jobId)
    console.log(`[size-territory-background] job ${jobId} → ${outcome}`)
  } catch (err) {
    // runSizingJob already records structured failure on the row; log for observability.
    console.error(`[size-territory-background] job ${jobId} threw`, err)
  }
  return new Response(null, { status: 202 })
}
