/**
 * seed-demo.ts — idempotent demo seed for crm-demo-v1 P1.
 *
 * Populates fictional practices across the live pipeline stages (Qualification Review,
 * stage 5, has no demo prospect yet — deferred to PR3 so it can carry seeded
 * qualification data) plus a stalled deal, a PRE-QUAL SKIPPED deal, and a lost deal.
 * (TRIAGE SKIPPED retired — skipped_triage deprecated in place, decision #110.)
 *
 * All prospect rows are created through src/lib/prospect-insert.ts
 * (buildSeedProspectInsert) and tagged `lead_source = 'demo_seed'`; deals are tagged
 * `notes = '[demo_seed]'`. Re-running deletes prior demo prospects/deals first
 * (prospects cascade to activities/proposals/qualification_*), so this is safe to
 * run repeatedly.
 *
 * TERRITORIES are protected qa_locked reference fixtures (the decision #94 v3 sizing
 * anchors), NOT demo churn: the seed ensures they exist (creating them qa_locked once
 * if absent) and reuses their stable IDs, but NEVER deletes them. This keeps the
 * anchor UUIDs and their territory_sizing_jobs provenance stable across reseeds
 * (the failure the PR2 reseed hit). All fallible/external work (Census fetch) runs
 * BEFORE any delete, so a mid-run failure can never leave demo rows
 * deleted-but-not-reinserted.
 *
 * Writes to the SALES project only (cprltmwwldbxcsunsafl). Requires service role:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage: (env loaded) npx tsx scripts/seed-demo.ts
 */

import { createClient } from '@supabase/supabase-js'
import { STAGE } from '../src/lib/pipeline-stages'
import { buildSeedProspectInsert, DEMO_LEAD_SOURCE, type SeedProspectInput } from '../src/lib/prospect-insert'
import { hashAccessCode, generateSalt } from '../src/lib/proposal/gate'
import { getCohortPopulationByCounty } from '../lib/census/queries'
import { PENETRATION_RATE_LOW, PENETRATION_RATE_HIGH } from '../lib/addressable-market-constants'
import type { DemandMatrix } from '../src/lib/proposal/types'
import { CensusError, CENSUS_YEAR } from '../lib/census/client'

const DEMO_TAG = '[demo_seed]'

function fail(msg: string): never {
  console.error(`[seed-demo] ${msg}`)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url) fail('NEXT_PUBLIC_SUPABASE_URL is not set.')
if (!key) fail('SUPABASE_SERVICE_ROLE_KEY is not set.')

// Guard: never point the seed at the NIP project.
if (url.includes('kjweckggegifjmmqccul')) fail('Refusing to seed the NIP project.')

const db = createClient(url, key, { auth: { persistSession: false } })

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

interface TerritorySeed {
  name: string
  center_lat: number
  center_lng: number
  addressable_patients_primary: number
  addressable_patients_outer: number
}

const TERRITORIES: TerritorySeed[] = [
  { name: 'Austin – Westlake', center_lat: 30.2711, center_lng: -97.8047, addressable_patients_primary: 5483, addressable_patients_outer: 8710 },
  { name: 'Dallas – Preston Hollow', center_lat: 32.8668, center_lng: -96.8065, addressable_patients_primary: 7204, addressable_patients_outer: 11380 },
  { name: 'Nashville – Green Hills', center_lat: 36.1006, center_lng: -86.8156, addressable_patients_primary: 4127, addressable_patients_outer: 6640 },
]

interface ProspectSeed extends SeedProspectInput {
  stageUpdatedDaysAgo: number
  territory?: string // territory name to attach a deal
  activities: { activity_type: 'note' | 'call_log'; body: string; daysAgo: number }[]
  /**
   * Optional seeded qualification data (scores/enrichment/review). Present only for
   * Qualification Review (stage 5) prospects. These rows key to prospects.id and
   * cascade with the prospect on reseed — they involve NO territory, so they add zero
   * territory-churn risk (the whole point of the gate is that territory creation is
   * unreachable until a review clears). `reviewed_by` is left null (seed has no real
   * auth.users exec id; the gate keys off `recommendation`, not the reviewer).
   */
  qualification?: {
    recommendation: 'proceed' | 'conditional' | 'not_qualified'
    reviewNotes?: string
    scores?: Record<string, unknown>
    enrichment?: Record<string, unknown>
  }
}

const PROSPECTS: ProspectSeed[] = [
  {
    full_name: 'Dr. Ana Reyes', practice_name: 'Reyes Aesthetics', specialty: 'Dermatology',
    email: 'areyes@reyesaesthetics.com', phone: '512-555-0110', website: 'reyesaesthetics.com',
    stage: STAGE.NEW_LEAD, stageUpdatedDaysAgo: 1, icp_score: 74,
    activities: [{ activity_type: 'note', body: 'Inbound from territory landing page.', daysAgo: 1 }],
  },
  {
    full_name: 'Dr. Ben Cole', practice_name: 'Cole Dermatology', specialty: 'Dermatology',
    email: 'bcole@colederm.com', phone: '214-555-0121',
    stage: STAGE.CONTACTED, stageUpdatedDaysAgo: 3, icp_score: 68,
    activities: [{ activity_type: 'call_log', body: 'Left voicemail; sent intro email.', daysAgo: 3 }],
  },
  {
    full_name: 'Dr. Carla Nunez', practice_name: 'Nunez Skin Institute', specialty: 'Plastic Surgery',
    email: 'cnunez@nunezskin.com', phone: '615-555-0132',
    stage: STAGE.DISCOVERY_CALL_SCHEDULED, stageUpdatedDaysAgo: 2, icp_score: 81,
    activities: [{ activity_type: 'note', body: 'Discovery call booked via Calendly for Thursday.', daysAgo: 2 }],
  },
  {
    full_name: 'Dr. David Kim', practice_name: 'Kim Hair & Skin', specialty: 'Hair Restoration',
    email: 'dkim@kimhairskin.com', phone: '469-555-0143',
    stage: STAGE.DISCOVERY_CALL_MET, stageUpdatedDaysAgo: 4, icp_score: 88,
    activities: [{ activity_type: 'call_log', body: 'Discovery met. Strong interest, asked about financing.', daysAgo: 4 }],
  },
  {
    // Qualification Review — cleared 'proceed'. Exercises the exec review + the hard
    // gate's pass path (this prospect CAN advance to Proposal Sent). No territory yet:
    // territory creation is gated behind clearing this review.
    full_name: 'Dr. Maya Osei', practice_name: 'Osei Dermatology', specialty: 'Dermatology',
    email: 'mosei@oseiderm.com', phone: '512-555-0231',
    stage: STAGE.QUALIFICATION_REVIEW, stageUpdatedDaysAgo: 1, icp_score: 86,
    activities: [{ activity_type: 'call_log', body: 'First meeting held; strong fit. Qualification review recorded.', daysAgo: 1 }],
    qualification: {
      recommendation: 'proceed',
      reviewNotes: 'Clear intent, financeable, engaged throughout. Cleared to proceed to proposal.',
      scores: {
        affect_energy_value: 'High', affect_energy_confidence: 0.8,
        coachability_value: 'Strong', coachability_confidence: 0.75,
        motivation_authenticity_value: 'Authentic', motivation_authenticity_confidence: 0.85,
        engagement_value: 'High', engagement_confidence: 0.9,
        chemistry_fit_value: 'Strong', chemistry_fit_confidence: 0.8,
        objections_raised_value: 'Minor pricing questions only',
        questions_asked_value: 'Several substantive questions about onboarding',
      },
      enrichment: {
        years_in_practice: 12,
        existing_aesthetic_services: 'Botox, fillers, laser',
        digital_footprint_present: true,
        prior_financing_relationship: true,
      },
    },
  },
  {
    // Qualification Review — 'conditional'. Exercises the edit-in-place re-score case
    // and the hard gate's BLOCK path (cannot advance to Proposal Sent until 'proceed').
    full_name: 'Dr. Noah Zeller', practice_name: 'Zeller Skin Clinic', specialty: 'Plastic Surgery',
    email: 'nzeller@zellerskin.com', phone: '214-555-0242',
    stage: STAGE.QUALIFICATION_REVIEW, stageUpdatedDaysAgo: 3, icp_score: 71,
    activities: [{ activity_type: 'call_log', body: 'First meeting held; interested but financing unclear. Conditional pending follow-up.', daysAgo: 3 }],
    qualification: {
      recommendation: 'conditional',
      reviewNotes: 'Good clinical fit but financing readiness unconfirmed. Re-score after the follow-up call.',
      scores: {
        affect_energy_value: 'Moderate', affect_energy_confidence: 0.6,
        coachability_value: 'Moderate', coachability_confidence: 0.6,
        motivation_authenticity_value: 'Genuine but hedged', motivation_authenticity_confidence: 0.55,
        engagement_value: 'Moderate', engagement_confidence: 0.65,
        chemistry_fit_value: 'Good', chemistry_fit_confidence: 0.7,
        objections_raised_value: 'Timing and capital availability',
      },
      enrichment: {
        years_in_practice: 6,
        existing_aesthetic_services: 'CoolSculpting',
        digital_footprint_present: true,
        prior_financing_relationship: false,
      },
    },
  },
  {
    full_name: 'Dr. Elena Petrov', practice_name: 'Petrov Aesthetic Group', specialty: 'Dermatology',
    email: 'epetrov@petrovaesthetic.com', phone: '512-555-0154',
    stage: STAGE.PROPOSAL_SENT, stageUpdatedDaysAgo: 2, icp_score: 79,
    territory: 'Austin – Westlake',
    activities: [{ activity_type: 'note', body: 'Proposal sent to the practice.', daysAgo: 2 }],
  },
  {
    // Stalled at Validation.
    full_name: 'Dr. Frank Ono', practice_name: 'Ono Wellness', specialty: 'Family Medicine',
    email: 'fono@onowellness.com', phone: '214-555-0165',
    stage: STAGE.VALIDATION, stageUpdatedDaysAgo: 9, icp_score: 63, deal_status: 'stalled',
    territory: 'Dallas – Preston Hollow',
    activities: [{ activity_type: 'note', body: 'No response to reference-call scheduling in 9 days.', daysAgo: 9 }],
  },
  {
    full_name: 'Dr. Gina Shah', practice_name: 'Shah Medical', specialty: 'Dermatology',
    email: 'gshah@shahmedical.com', phone: '615-555-0176',
    stage: STAGE.FUNDING_PRE_QUALIFIED, stageUpdatedDaysAgo: 2, icp_score: 85, funding_prequal_cleared: true,
    territory: 'Nashville – Green Hills',
    activities: [{ activity_type: 'note', body: 'Lender confirmed pre-qual.', daysAgo: 2 }],
  },
  {
    // Advanced to Contract Sent without cleared pre-qual → PRE-QUAL SKIPPED.
    full_name: 'Dr. Henry Ford', practice_name: 'Ford Clinic', specialty: 'Plastic Surgery',
    email: 'hford@fordclinic.com', phone: '469-555-0187',
    stage: STAGE.CONTRACT_SENT, stageUpdatedDaysAgo: 1, icp_score: 77, skipped_funding_prequal: true,
    territory: 'Dallas – Preston Hollow',
    activities: [{ activity_type: 'note', body: 'Contract sent ahead of lender confirmation — skip recorded.', daysAgo: 1 }],
  },
  {
    full_name: 'Dr. Iris Lang', practice_name: 'Lang Institute', specialty: 'Hair Restoration',
    email: 'ilang@langinstitute.com', phone: '512-555-0198',
    stage: STAGE.CONTRACT_SIGNED, stageUpdatedDaysAgo: 3, icp_score: 90, funding_prequal_cleared: true,
    territory: 'Austin – Westlake',
    activities: [{ activity_type: 'note', body: 'Buyer signed via Box. Awaiting countersign + funding.', daysAgo: 3 }],
  },
  {
    full_name: 'Dr. Jonah Reed', practice_name: 'Reed Hair Restoration', specialty: 'Hair Restoration',
    email: 'jreed@reedhair.com', phone: '214-555-0209',
    stage: STAGE.FUNDED_WON, stageUpdatedDaysAgo: 5, icp_score: 92, funding_prequal_cleared: true,
    territory: 'Nashville – Green Hills',
    activities: [{ activity_type: 'note', body: 'Signed AND funded. Instrumentation tag captured.', daysAgo: 5 }],
  },
  {
    full_name: 'Dr. Kira Voss', practice_name: 'Voss Aesthetics', specialty: 'Dermatology',
    email: 'kvoss@vossaesthetics.com', phone: '469-555-0210',
    stage: STAGE.IMPLEMENTATION_HANDOFF_SCHEDULED, stageUpdatedDaysAgo: 6, icp_score: 89, funding_prequal_cleared: true,
    territory: 'Dallas – Preston Hollow',
    activities: [{ activity_type: 'note', body: 'Implementation handoff scheduled with launch team.', daysAgo: 6 }],
  },
  {
    // Lost — filtered from the board by default, but present so the state exists.
    full_name: 'Dr. Leo Marsh', practice_name: 'Marsh Clinic', specialty: 'Family Medicine',
    email: 'lmarsh@marshclinic.com', phone: '615-555-0221',
    stage: STAGE.DISCOVERY_CALL_SCHEDULED, stageUpdatedDaysAgo: 14, icp_score: 45, deal_status: 'lost',
    notes: 'Chose a competing model. Marked lost.',
    activities: [{ activity_type: 'note', body: 'Prospect declined; going another direction.', daysAgo: 14 }],
  },
]

const QA_ANCHOR_TAG = '[qa_anchor]'

/**
 * Ensure the protected anchor territories exist; return name -> { id, addressable }.
 *
 * These are qa_locked reference fixtures (the decision #94 v3 sizing anchors). They
 * are NEVER deleted or recreated by the seed — created once (qa_locked) if absent,
 * otherwise reused as-is. Reusing their stable IDs is what keeps the anchor UUIDs and
 * their territory_sizing_jobs provenance intact across reseeds. Demo deals attach to
 * these rows; there are no separate churnable demo territories to collide with them.
 */
async function ensureAnchorTerritories(): Promise<Map<string, { id: string; addressable: number }>> {
  const map = new Map<string, { id: string; addressable: number }>()
  for (const t of TERRITORIES) {
    const found = await db
      .from('territories')
      .select('id, addressable_patients_primary')
      .eq('name', t.name)
      .eq('qa_locked', true)
      .maybeSingle()
    if (found.error) fail(`lookup anchor territory ${t.name}: ${found.error.message}`)
    if (found.data) {
      map.set(t.name, { id: found.data.id, addressable: found.data.addressable_patients_primary ?? t.addressable_patients_primary })
      continue
    }
    // Absent (fresh DB) → create it once, qa_locked, so future reseeds reuse it.
    const ins = await db
      .from('territories')
      .insert({ ...t, status: 'available', formula_run_at: new Date().toISOString(), qa_locked: true, notes: QA_ANCHOR_TAG })
      .select('id, addressable_patients_primary')
      .single()
    if (ins.error) fail(`create anchor territory ${t.name}: ${ins.error.message}`)
    map.set(t.name, { id: ins.data!.id, addressable: ins.data!.addressable_patients_primary ?? t.addressable_patients_primary })
  }
  return map
}

async function main() {
  // ── Prep phase (nothing churnable deleted yet) ────────────────────────────
  // Everything fallible/external (anchor ensure + Census) happens BEFORE any
  // delete, so a mid-run failure can never leave demo rows deleted-but-not-
  // reinserted. Combined with never deleting territories, this removes both
  // failure classes the PR2 reseed hit (territory/sizing-job FK collision + a
  // mid-run Census throw).
  console.log('[seed-demo] Ensuring protected anchor territories…')
  const territoryMap = await ensureAnchorTerritories()

  const austin = territoryMap.get('Austin – Westlake')
  if (!austin) fail('Austin – Westlake anchor territory missing after ensure')
  const addressable_market_total = austin.addressable

  console.log('[seed-demo] Fetching Census demand matrix…')
  // B01001 demand matrix from Census. Throws CensusError if CENSUS_API_KEY is unset.
  let cohorts: Array<{ ageBand: string; male: number; female: number }>
  try {
    cohorts = await getCohortPopulationByCounty('48453') // Travis County, TX (Austin – Westlake)
  } catch (e) {
    if (e instanceof CensusError) {
      fail(
        `CENSUS_API_KEY required to compute the B01001 demand_matrix for the proposal seed (decision #68). Set CENSUS_API_KEY and re-run. Error: ${e.message}`,
      )
    }
    throw e
  }
  const sumMale = cohorts.reduce((s, c) => s + c.male, 0)
  const sumFemale = cohorts.reduce((s, c) => s + c.female, 0)
  const total_pop = sumMale + sumFemale
  const demand_matrix: DemandMatrix = {
    // Vintage reflects what the census client actually fetches (CENSUS_YEAR), not
    // the constants file's declared ACS5 vintage — keep provenance honest.
    source: `ACS B01001 (ACS5 ${CENSUS_YEAR})`,
    vintage: CENSUS_YEAR,
    cohorts,
  }
  const male_pct = total_pop ? +((sumMale / total_pop) * 100).toFixed(1) : null
  const female_pct = total_pop ? +((sumFemale / total_pop) * 100).toFixed(1) : null
  const new_patients_range_low = Math.round(PENETRATION_RATE_LOW * addressable_market_total)
  const new_patients_range_high = Math.round(PENETRATION_RATE_HIGH * addressable_market_total)

  // ── Churn reset (FK-safe) ─────────────────────────────────────────────────
  // deals (no cascade) first, then prospects (cascades activities/proposals/
  // qualification_*). Territories are qa_locked fixtures — never deleted here.
  console.log('[seed-demo] Resetting demo fixture rows…')
  const del1 = await db.from('deals').delete().eq('notes', DEMO_TAG)
  if (del1.error) fail(`clean deals: ${del1.error.message}`)
  const del2 = await db.from('prospects').delete().eq('lead_source', DEMO_LEAD_SOURCE)
  if (del2.error) fail(`clean prospects: ${del2.error.message}`)

  console.log('[seed-demo] Inserting prospects, deals, activities…')
  let prospectCount = 0
  let dealCount = 0
  let activityCount = 0
  let qualificationCount = 0
  const prospectNameToId = new Map<string, string>()
  for (const p of PROSPECTS) {
    const row = buildSeedProspectInsert(p)
    const { data: inserted, error } = await db
      .from('prospects')
      .insert({ ...row, stage_updated_at: daysAgo(p.stageUpdatedDaysAgo) })
      .select('id')
      .single()
    if (error) fail(`insert prospect ${p.full_name}: ${error.message}`)
    const prospectId = inserted!.id
    prospectNameToId.set(p.full_name, prospectId)
    prospectCount++

    if (p.territory) {
      const territoryId = territoryMap.get(p.territory)?.id
      if (!territoryId) fail(`prospect ${p.full_name} references unknown territory ${p.territory}`)
      const { error: dErr } = await db.from('deals').insert({
        prospect_id: prospectId,
        territory_id: territoryId,
        territory_price: 179000,
        // proposal_url intentionally left NULL (decision #200): the legacy public
        // /proposals/[prospectId] route was removed. Gated proposal URLs are derived
        // from proposals.slug via src/lib/proposal/generate.ts, never persisted here.
        proposal_sent_at: daysAgo(p.stageUpdatedDaysAgo),
        notes: DEMO_TAG,
      })
      if (dErr) fail(`insert deal for ${p.full_name}: ${dErr.message}`)
      dealCount++
    }

    for (const a of p.activities) {
      const { error: aErr } = await db.from('activities').insert({
        prospect_id: prospectId,
        activity_type: a.activity_type,
        body: a.body,
        created_by: DEMO_LEAD_SOURCE,
        created_at: daysAgo(a.daysAgo),
      })
      if (aErr) fail(`insert activity for ${p.full_name}: ${aErr.message}`)
      activityCount++
    }

    // Qualification data (Qualification Review prospects only). Keyed to prospects.id,
    // cascades on reseed — no territory involved, so no territory-churn risk (§6).
    if (p.qualification) {
      const q = p.qualification
      if (q.scores) {
        const { error: sErr } = await db
          .from('qualification_scores')
          .insert({ prospect_id: prospectId, ...q.scores })
        if (sErr) fail(`insert qualification_scores for ${p.full_name}: ${sErr.message}`)
      }
      if (q.enrichment) {
        const { error: eErr } = await db
          .from('qualification_enrichment')
          .insert({ prospect_id: prospectId, ...q.enrichment })
        if (eErr) fail(`insert qualification_enrichment for ${p.full_name}: ${eErr.message}`)
      }
      const { error: rErr } = await db.from('qualification_reviews').insert({
        prospect_id: prospectId,
        recommendation: q.recommendation,
        notes: q.reviewNotes ?? null,
        reviewed_at: daysAgo(p.stageUpdatedDaysAgo),
        // reviewed_by intentionally null — seed has no real auth.users exec id.
      })
      if (rErr) fail(`insert qualification_reviews for ${p.full_name}: ${rErr.message}`)
      qualificationCount++
    }
  }

  console.log('[seed-demo] Seeding proposal for Dr. Elena Petrov…')
  const DEMO_PROPOSAL_SLUG = 'petrov-a1b2'
  const DEMO_ACCESS_CODE = 'GHMD-DEMO-2026'

  const prospectId = prospectNameToId.get('Dr. Elena Petrov')
  if (!prospectId) fail('Dr. Elena Petrov not found in inserted prospects')

  // addressable_market_total / demand_matrix / *_pct / new_patients_range_* were all
  // computed in the prep phase (before any delete) — reuse them here.
  const salt = generateSalt()
  const access_code_hash = hashAccessCode(DEMO_ACCESS_CODE, salt)

  // ILLUSTRATIVE demo values — no formula-v2 revenue model exists yet. These are earnings-representation content (spec §10 ⚠, active 506(b)); replace with a cleared revenue model before ANY live send. Flagged to Chat.
  const scenario_outputs = { conservative: 378000, moderate: 546000, growth: 714000, break_even_months: 9 }

  const { error: pErr } = await db.from('proposals').insert({
    prospect_id: prospectId,
    slug: DEMO_PROPOSAL_SLUG,
    access_code_hash,
    access_code_salt: salt,
    prospect_name_full: 'Dr. Elena Petrov',
    practice_name: 'Petrov Aesthetic Group',
    specialty: 'Dermatology',
    territory_name: 'Austin – Westlake',
    prepared_month: 'July 2026',
    practice_logo_url: null,
    prospect_photo_url: null,
    territory_polygon: null,
    territory_pin_lat: 30.2711,
    territory_pin_lng: -97.8047,
    addressable_market_total,
    addressable_market_male_pct: male_pct,
    addressable_market_female_pct: female_pct,
    demand_matrix,
    new_patients_range_low,
    new_patients_range_high,
    scenario_inputs: { patient_base: 2400, candidate_pct: 37, conversion_pace: 84 },
    scenario_outputs,
  })
  if (pErr) fail(`insert proposal for Dr. Elena Petrov: ${pErr.message}`)

  console.log(
    `[seed-demo] Done: ${TERRITORIES.length} territories, ${prospectCount} prospects, ${dealCount} deals, ${activityCount} activities, ${qualificationCount} qualification reviews.`,
  )
  console.log(`[seed-demo] Proposal seeded: /p/${DEMO_PROPOSAL_SLUG}  (access code: ${DEMO_ACCESS_CODE})`)
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
