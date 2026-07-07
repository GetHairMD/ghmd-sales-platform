/**
 * Live verification for the async v3 sizing rework (Coder brief §Verification).
 *
 * Drives the SHARED job lifecycle end-to-end against real infra:
 *   createSizingJob (enqueue) → runSizingJob (out-of-band compute) → getSizingJob (poll)
 * for the 3 Pilot locations (Austin–Westlake, Dallas–Preston Hollow, Nashville–Green Hills),
 * COLD (empty GEOID cache) then WARM (cache primed by the cold run). These are the exact
 * functions POST /api/territories/size, the poll route, and the Netlify Background Function
 * wrap — so this exercises the real compute + cache + status transitions, not a mock.
 *
 * It also asserts the NON-WRITE BOUNDARY: the count of territories with a boundary_geom is
 * unchanged across the whole run (the jobs never write territories.boundary_*).
 *
 * Run:  npx tsx scripts/verify-territory-sizing.ts
 * Reads secrets from .env.local (MAPBOX_SERVER_TOKEN, CENSUS_API_KEY, SUPABASE_*).
 */

import { readFileSync } from 'node:fs'

function loadEnv(path = '.env.local'): void {
  let txt = ''
  try {
    txt = readFileSync(path, 'utf8')
  } catch {
    console.error(`Could not read ${path}`)
    process.exit(1)
  }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}

loadEnv()

// Import AFTER env is populated (modules read secrets lazily inside functions).
import { createServiceClient } from '../src/lib/supabase/service'
import { createSizingJob, runSizingJob, getSizingJob } from '../src/lib/territory-sizing-jobs'

interface Loc {
  label: string
  lat: number
  lng: number
}

const LOCATIONS: Loc[] = [
  { label: 'Austin – Westlake', lat: 30.2849, lng: -97.8028 },
  { label: 'Dallas – Preston Hollow', lat: 32.8848, lng: -96.8065 },
  { label: 'Nashville – Green Hills', lat: 36.1035, lng: -86.8156 },
]

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

async function boundaryCount(service: ReturnType<typeof createServiceClient>): Promise<number> {
  const { count } = await service
    .from('territories')
    .select('id', { count: 'exact', head: true })
    .not('boundary_geom', 'is', null)
  return count ?? 0
}

async function runOnce(
  service: ReturnType<typeof createServiceClient>,
  loc: Loc,
  phase: 'COLD' | 'WARM',
): Promise<void> {
  const wall0 = Date.now()
  const { jobId } = await createSizingJob(service, { center: { lat: loc.lat, lng: loc.lng } })
  const terminal = await runSizingJob(service, jobId)
  const job = await getSizingJob(service, jobId)
  const wallMs = Date.now() - wall0

  if (!job) {
    console.log(`  [${phase}] ${loc.label}: job ${jobId} vanished`)
    return
  }

  const t = (job.timing ?? {}) as Record<string, number>
  if (job.status === 'succeeded') {
    const r = (job.result as { result?: Record<string, unknown> })?.result ?? {}
    const status = r.status as string
    const minute = (r.minutes ?? r.bestMinutes) as number | undefined
    const addressable = Math.round((r.addressable ?? r.bestAddressable ?? 0) as number)
    console.log(
      `  [${phase}] ${loc.label}\n` +
        `        outcome=${status} minute=${minute} addressable=${addressable.toLocaleString()}\n` +
        `        wall=${fmtMs(wallMs)} total=${fmtMs(t.totalMs ?? 0)} census=${fmtMs(t.censusMs ?? 0)}\n` +
        `        BGs=${t.blockGroupsIntersecting ?? 0} cacheHits=${t.cacheHits ?? 0} cacheMisses=${t.cacheMisses ?? 0} ` +
        `counties=${t.counties ?? 0} censusRequests=${t.censusRequests ?? 0}`,
    )
  } else {
    console.log(
      `  [${phase}] ${loc.label}: status=${job.status} (transition=${terminal}) wall=${fmtMs(wallMs)}\n` +
        `        error=${JSON.stringify(job.error)}`,
    )
  }
}

async function main(): Promise<void> {
  const service = createServiceClient()

  const before = await boundaryCount(service)
  console.log(`\nNon-write boundary check — territories with boundary_geom BEFORE: ${before}\n`)

  console.log('=== COLD cache (first touch of each metro) ===')
  for (const loc of LOCATIONS) await runOnce(service, loc, 'COLD')

  console.log('\n=== WARM cache (GEOID cache primed by the cold run) ===')
  for (const loc of LOCATIONS) await runOnce(service, loc, 'WARM')

  const after = await boundaryCount(service)
  console.log(`\nNon-write boundary check — territories with boundary_geom AFTER:  ${after}`)
  console.log(
    after === before
      ? '✅ NON-WRITE BOUNDARY HELD: no territories.boundary_geom written by any job.\n'
      : `❌ BOUNDARY VIOLATION: count changed ${before} → ${after}\n`,
  )
}

main().catch((err) => {
  console.error('verify failed:', err)
  process.exit(1)
})
