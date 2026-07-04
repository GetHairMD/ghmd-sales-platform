/**
 * seed-demo.ts — idempotent demo seed for crm-demo-v1 P1.
 *
 * Populates one fictional practice per pipeline stage (1–11) plus a stalled deal,
 * a TRIAGE SKIPPED deal, a PRE-QUAL SKIPPED deal, and a lost deal — so every card
 * state and badge on the three surfaces renders from real data.
 *
 * All prospect rows are created through src/lib/prospect-insert.ts
 * (buildSeedProspectInsert) and tagged `lead_source = 'demo_seed'`. Territories and
 * deals are tagged `notes = '[demo_seed]'`. Re-running deletes prior demo rows first
 * (prospects cascade to activities), so this is safe to run repeatedly.
 *
 * Writes to the SALES project only (cprltmwwldbxcsunsafl). Requires service role:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Usage: (env loaded) npx tsx scripts/seed-demo.ts
 */

import { createClient } from '@supabase/supabase-js'
import { STAGE } from '../src/lib/pipeline-stages'
import { buildSeedProspectInsert, DEMO_LEAD_SOURCE, type SeedProspectInput } from '../src/lib/prospect-insert'

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
    // Advanced to Proposal Sent without a completed triage → TRIAGE SKIPPED.
    full_name: 'Dr. Elena Petrov', practice_name: 'Petrov Aesthetic Group', specialty: 'Dermatology',
    email: 'epetrov@petrovaesthetic.com', phone: '512-555-0154',
    stage: STAGE.PROPOSAL_SENT, stageUpdatedDaysAgo: 2, icp_score: 79, skipped_triage: true,
    territory: 'Austin – Westlake',
    activities: [{ activity_type: 'note', body: 'Proposal sent. Triage not yet complete — advanced with skip recorded.', daysAgo: 2 }],
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

async function main() {
  console.log('[seed-demo] Cleaning prior demo rows…')
  // deals reference prospects + territories (no cascade) → delete first.
  const del1 = await db.from('deals').delete().eq('notes', DEMO_TAG)
  if (del1.error) fail(`clean deals: ${del1.error.message}`)
  // prospects cascade to activities.
  const del2 = await db.from('prospects').delete().eq('lead_source', DEMO_LEAD_SOURCE)
  if (del2.error) fail(`clean prospects: ${del2.error.message}`)
  const del3 = await db.from('territories').delete().eq('notes', DEMO_TAG)
  if (del3.error) fail(`clean territories: ${del3.error.message}`)

  console.log('[seed-demo] Inserting territories…')
  const territoryIds = new Map<string, string>()
  for (const t of TERRITORIES) {
    const { data, error } = await db
      .from('territories')
      .insert({ ...t, status: 'available', formula_run_at: new Date().toISOString(), notes: DEMO_TAG })
      .select('id')
      .single()
    if (error) fail(`insert territory ${t.name}: ${error.message}`)
    territoryIds.set(t.name, data!.id)
  }

  console.log('[seed-demo] Inserting prospects, deals, activities…')
  let prospectCount = 0
  let dealCount = 0
  let activityCount = 0
  for (const p of PROSPECTS) {
    const row = buildSeedProspectInsert(p)
    const { data: inserted, error } = await db
      .from('prospects')
      .insert({ ...row, stage_updated_at: daysAgo(p.stageUpdatedDaysAgo) })
      .select('id')
      .single()
    if (error) fail(`insert prospect ${p.full_name}: ${error.message}`)
    const prospectId = inserted!.id
    prospectCount++

    if (p.territory) {
      const territoryId = territoryIds.get(p.territory)
      if (!territoryId) fail(`prospect ${p.full_name} references unknown territory ${p.territory}`)
      const { error: dErr } = await db.from('deals').insert({
        prospect_id: prospectId,
        territory_id: territoryId,
        territory_price: 179000,
        proposal_url: `https://proposals.gethairmd.com/proposals/${prospectId}`,
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
  }

  console.log(
    `[seed-demo] Done: ${TERRITORIES.length} territories, ${prospectCount} prospects, ${dealCount} deals, ${activityCount} activities.`,
  )
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
