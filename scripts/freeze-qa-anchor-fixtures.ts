/**
 * freeze-qa-anchor-fixtures.ts — one-time generator for the v3 QA-anchor freeze
 * (decision #96; figures per decision #127). NOT run in CI.
 *
 * WHAT IT DOES
 * For each of the three v3 QA anchors (Austin / Dallas / Nashville) it:
 *   1. Reads the winning drive-time isochrone contour + the locked addressable figure
 *      from that anchor's completed `territory_sizing_jobs` row (source of #127).
 *   2. Selects the census block groups that produced that figure from the durable
 *      Rule-5 cache `public.census_block_group_cache`, under an INTEGRITY FILTER of
 *      `fetched_at <= <last #127 job finish>` — this includes the warm-hit rows the
 *      #127 run actually reused (the run was warm-cache-dominated) and excludes any
 *      row refreshed AFTER #127. (A lower-bounded "run window" would capture ~17 rows
 *      and reproduce nothing — see the PR description.)
 *   3. Runs the REAL pure pipeline (apportionB19001 → computeAddressableForPolygon) and
 *      REFUSES to emit unless the result reproduces the job's addressable at published
 *      (2-dp) precision — reproduction, not a timestamp, is the proof of completeness.
 *   4. Trims to the CONTRIBUTING block groups (≥1 block inside the winning contour),
 *      re-verifies, and writes one JSON fixture per anchor with a provenance header.
 *
 * SCOPE: fixture/test-layer only. Reads `territory_sizing_jobs` + the census cache;
 * writes ONLY repo files under src/lib/__fixtures__/qa-anchors/. Never writes any
 * `territories` / `territory_sizing_jobs` row.
 *
 * Regenerate (only when the methodology changes and the anchors are re-derived):
 *   npx tsx --env-file=.env.local scripts/freeze-qa-anchor-fixtures.ts
 */

import { createClient } from '@supabase/supabase-js'
import { getSupabaseSecretKey } from '../src/lib/supabase/secret-key'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  apportionB19001,
  householdWeightForBlockGroup,
  type BlockGroupRecord,
} from '../src/lib/polygon-apportionment'
import { computeAddressableForPolygon } from '../src/lib/territory-sizing-v3'
import { bboxOf } from '../src/lib/geometry'
import { rowToBlockGroup, type BlockGroupCacheRow } from '../src/lib/census-bg-cache'
import type { IsochroneContour } from '../src/lib/isochrone'
import creditTable from '../data/experian-credit-share-by-state.json'

const FREEZE_DECISION = 96
const SOURCE_DECISION = 127
const FROZEN_ON = '2026-07-10'
/** Last #127 job finish (Dallas computed_at). Upper-bound integrity cutoff. */
const CENSUS_CUTOFF_ISO = '2026-07-10T14:59:35.001Z'
/** Degrees to pad the winning-contour bbox when pulling candidate BGs (self-checked by exact reproduction). */
const BBOX_PAD_DEG = 0.25

const OUT_DIR = join(process.cwd(), 'src', 'lib', '__fixtures__', 'qa-anchors')

const creditStates = { states: (creditTable as { states: Record<string, number> }).states }

interface AnchorSpec {
  name: string
  slug: string
  jobId: string
  stateFips: string
}

const ANCHORS: AnchorSpec[] = [
  { name: 'Austin – Westlake', slug: 'austin-westlake', jobId: '14fb63ba-6cf7-4978-bdef-b947ee021399', stateFips: '48' },
  { name: 'Dallas – Preston Hollow', slug: 'dallas-preston-hollow', jobId: 'd6efac7b-6f1f-4408-9780-53a9fe7cee59', stateFips: '48' },
  { name: 'Nashville – Green Hills', slug: 'nashville-green-hills', jobId: '7caf4c20-cea2-4736-a376-05f4ae61104c', stateFips: '47' },
]

function fail(msg: string): never {
  console.error(`[freeze-qa-anchors] ${msg}`)
  process.exit(1)
}

const round2 = (n: number): number => Math.round(n * 100) / 100

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) fail('NEXT_PUBLIC_SUPABASE_URL is not set. Run with: npx tsx --env-file=.env.local scripts/freeze-qa-anchor-fixtures.ts')
  // Throws (loudly, naming the variables) when no service credential is configured.
  const key = getSupabaseSecretKey()
  if (url.includes('kjweckggegifjmmqccul')) fail('Refusing to read the NIP project.')

  const db = createClient(url, key, { auth: { persistSession: false } })
  mkdirSync(OUT_DIR, { recursive: true })

  for (const anchor of ANCHORS) {
    console.log(`\n=== ${anchor.name} (${anchor.jobId}) ===`)

    // 1. Winning contour + locked figure from the job row.
    const { data: job, error: jobErr } = await db
      .from('territory_sizing_jobs')
      .select('result')
      .eq('id', anchor.jobId)
      .single()
    if (jobErr || !job) fail(`job read failed: ${jobErr?.message ?? 'no row'}`)

    const result = (job.result ?? {}) as {
      result?: { status?: string; minutes?: number; addressable?: number }
      sizedContour?: IsochroneContour | null
      provenance?: { center?: { lat: number; lng: number }; soldClipped?: boolean }
    }
    const sizing = result.result
    const contour = result.sizedContour
    const center = result.provenance?.center
    if (!sizing || sizing.status !== 'VIABLE' || typeof sizing.addressable !== 'number' || typeof sizing.minutes !== 'number') {
      fail(`job result is not a VIABLE sizing: ${JSON.stringify(sizing)}`)
    }
    if (!contour || contour.minutes !== sizing.minutes || !contour.polygon) {
      fail('job sizedContour missing or minute-mismatched')
    }
    if (result.provenance?.soldClipped) fail('anchor job was sold-clipped — generator assumes soldUnion=null')
    if (!center) fail('job provenance missing center')

    const storedAddressable = sizing.addressable
    const minutes = sizing.minutes
    console.log(`stored: ${minutes} min / addressable ${storedAddressable}`)

    // 2. Candidate BGs from the census cache under the integrity cutoff, bbox-padded.
    // PostgREST caps every response at 1000 rows, so paginate to a COMPLETE set — a
    // silent truncation here would under-select and (correctly) fail the reproduction gate.
    const bbox = bboxOf(contour.polygon)
    const [minLng, minLat, maxLng, maxLat] = bbox
    const PAGE = 1000
    const cacheRows: BlockGroupCacheRow[] = []
    for (let offset = 0; ; offset += PAGE) {
      const { data: rows, error: cacheErr } = await db
        .from('census_block_group_cache')
        .select('geoid, state_fips, centroid_lng, centroid_lat, b19001, blocks, fetched_at')
        .eq('state_fips', anchor.stateFips)
        .lte('fetched_at', CENSUS_CUTOFF_ISO)
        .gte('centroid_lng', minLng - BBOX_PAD_DEG)
        .lte('centroid_lng', maxLng + BBOX_PAD_DEG)
        .gte('centroid_lat', minLat - BBOX_PAD_DEG)
        .lte('centroid_lat', maxLat + BBOX_PAD_DEG)
        .order('geoid', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (cacheErr || !rows) fail(`cache read failed: ${cacheErr?.message ?? 'no rows'}`)
      cacheRows.push(...(rows as BlockGroupCacheRow[]))
      if (rows.length < PAGE) break
    }

    const candidates: BlockGroupRecord[] = cacheRows.map(rowToBlockGroup)
    console.log(`candidate BGs (cutoff+bbox, paginated): ${candidates.length}`)

    // 3. Real pipeline over ALL candidates — must reproduce the stored figure (2-dp).
    const fullApportion = apportionB19001(candidates, contour.polygon) // soldUnion = null (soldClipped=false)
    const fullDetail = computeAddressableForPolygon(fullApportion, creditStates)
    console.log(`computed (all candidates): ${fullDetail.addressable}`)
    if (round2(fullDetail.addressable) !== round2(storedAddressable)) {
      fail(
        `REPRODUCTION FAILED for ${anchor.slug}: computed ${round2(fullDetail.addressable)} ≠ stored ${round2(storedAddressable)}. ` +
          `Widen BBOX_PAD_DEG (selection may be incomplete).`,
      )
    }

    // 4. Trim to CONTRIBUTING BGs (≥1 block inside the contour) and re-verify.
    const contributing = candidates.filter(
      (bg) => householdWeightForBlockGroup(bg, contour.polygon).weight > 0,
    )
    const trimApportion = apportionB19001(contributing, contour.polygon)
    const trimDetail = computeAddressableForPolygon(trimApportion, creditStates)
    console.log(`contributing BGs: ${contributing.length} → computed ${trimDetail.addressable}`)
    if (trimDetail.addressable !== fullDetail.addressable) {
      fail(`TRIM CHANGED THE NUMBER for ${anchor.slug}: ${trimDetail.addressable} ≠ ${fullDetail.addressable}`)
    }

    const expectedAddressable = trimDetail.addressable
    const exactMatchToJob = expectedAddressable === storedAddressable
    console.log(
      `published(2dp): ${round2(expectedAddressable)} | exact-match-to-job: ${exactMatchToJob}` +
        (exactMatchToJob ? '' : ` (job stored ${storedAddressable}; float order differs, ties at 2-dp)`),
    )

    // 5. Emit the fixture JSON with a provenance header.
    const fixture = {
      _provenance: {
        note:
          'Real-derived v3 QA anchor freeze — NOT synthetic. Winning isochrone from the source ' +
          'territory_sizing_jobs row; census block groups from public.census_block_group_cache.',
        freezeDecision: FREEZE_DECISION,
        sourceDecision: SOURCE_DECISION,
        sourceJobId: anchor.jobId,
        frozenOn: FROZEN_ON,
        censusSource: 'public.census_block_group_cache',
        censusIntegrityFilter: `fetched_at <= ${CENSUS_CUTOFF_ISO} (last #127 job finish; excludes any post-#127 refresh)`,
        reproduces:
          'addressable-arithmetic path (apportionB19001 → computeAddressableForPolygon) at the locked ' +
          'winning minute — NOT the full expansion / minute-selection search',
        sourceJobAddressable: storedAddressable,
        exactMatchToJobFullPrecision: exactMatchToJob,
        stalenessCondition:
          'Re-derive (supersede) only when the v3 methodology/formula changes — not on a schedule. ' +
          'Regenerate: npx tsx --env-file=.env.local scripts/freeze-qa-anchor-fixtures.ts',
      },
      name: anchor.name,
      slug: anchor.slug,
      stateFips: anchor.stateFips,
      center,
      minutes,
      /** Value the frozen inputs reproduce exactly (the regression lock). */
      expectedAddressable,
      /** The decision #127 / §8.8 published figure (2-dp). */
      publishedAddressable: round2(expectedAddressable),
      winningContour: contour,
      blockGroups: contributing,
    }

    const outPath = join(OUT_DIR, `${anchor.slug}.json`)
    writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n', 'utf8')
    console.log(`wrote ${outPath} (${contributing.length} BGs)`)
  }

  console.log('\n[freeze-qa-anchors] all three anchors reproduced and frozen.')
}

main().catch((e) => fail(e instanceof Error ? e.stack ?? e.message : String(e)))
