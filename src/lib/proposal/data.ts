/**
 * Service-role data access for /p/[slug] (Session B).
 *
 * SERVER-ONLY. The proposal tables are RLS-enabled with no anon/authenticated
 * policy (service-role-only). Every read/write here uses the service-role key and
 * runs exclusively on the server — the browser never touches these tables, so no
 * proposal data can leak pre-auth.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ProposalEventType, ProposalRecord } from './types'

/** Columns safe to render — final presentation values only, no formula mechanics. */
const PROPOSAL_SELECT =
  'id, prospect_id, slug, prospect_name_full, practice_name, practice_logo_url, ' +
  'specialty, territory_name, prospect_photo_url, territory_polygon, ' +
  'territory_pin_lat, territory_pin_lng, prepared_month, addressable_market_total, ' +
  'addressable_market_male_pct, addressable_market_female_pct, demand_matrix, ' +
  'new_patients_range_low, new_patients_range_high, scenario_inputs, scenario_outputs'

let cached: SupabaseClient | null = null

function serviceClient(): SupabaseClient {
  if (cached) return cached
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  return cached
}

/** Minimal gate row — used only to verify a submitted access code. */
export interface ProposalGateRow {
  prospect_id: string
  access_code_hash: string
  access_code_salt: string
}

export async function getProposalGate(slug: string): Promise<ProposalGateRow | null> {
  const { data } = await serviceClient()
    .from('proposals')
    .select('prospect_id, access_code_hash, access_code_salt')
    .eq('slug', slug)
    .maybeSingle()
  return (data as ProposalGateRow | null) ?? null
}

/** Full proposal for rendering (post-gate). */
export async function getProposalBySlug(slug: string): Promise<ProposalRecord | null> {
  const { data } = await serviceClient()
    .from('proposals')
    .select(PROPOSAL_SELECT)
    .eq('slug', slug)
    .maybeSingle()
  return (data as ProposalRecord | null) ?? null
}

export async function logProposalSession(input: {
  prospectId: string
  device: string | null
  referrer: string | null
  sessionCookieId: string
}): Promise<void> {
  await serviceClient().from('proposal_sessions').insert({
    prospect_id: input.prospectId,
    device: input.device,
    referrer: input.referrer,
    session_cookie_id: input.sessionCookieId,
  })
}

export async function logProposalEvent(input: {
  prospectId: string
  sessionCookieId: string | null
  eventType: ProposalEventType
  payload?: Record<string, unknown>
}): Promise<void> {
  await serviceClient().from('proposal_events').insert({
    prospect_id: input.prospectId,
    session_cookie_id: input.sessionCookieId,
    event_type: input.eventType,
    payload: input.payload ?? null,
  })
}

/**
 * Persist a Next Step message-form submission (spec §6.18 secondary action) as a
 * prospect activity note, so it lands on the rep's timeline. Prospect identity
 * comes from the verified unlock cookie, never the request body.
 */
export async function logProposalMessage(input: {
  prospectId: string
  message: string
}): Promise<void> {
  await serviceClient().from('activities').insert({
    prospect_id: input.prospectId,
    activity_type: 'note',
    body: `Proposal message from prospect:\n${input.message}`,
    created_by: 'proposal_message',
  })
}
