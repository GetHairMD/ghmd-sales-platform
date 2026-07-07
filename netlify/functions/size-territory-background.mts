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

// Minimal local typing — @netlify/functions is not a dependency and the app tsconfig does
// not compile .mts, so we avoid importing its types. A Background Function returns void.
interface NetlifyEvent {
  body?: string | null
}

export default async function handler(event: NetlifyEvent): Promise<void> {
  let jobId: string | undefined
  try {
    jobId = JSON.parse(event.body ?? '{}')?.jobId
  } catch {
    console.error('[size-territory-background] invalid JSON body')
    return
  }
  if (!jobId) {
    console.error('[size-territory-background] missing jobId')
    return
  }

  try {
    const outcome = await runSizingJob(createServiceClient(), jobId)
    console.log(`[size-territory-background] job ${jobId} → ${outcome}`)
  } catch (err) {
    // runSizingJob already records structured failure on the row; log for observability.
    console.error(`[size-territory-background] job ${jobId} threw`, err)
  }
}
