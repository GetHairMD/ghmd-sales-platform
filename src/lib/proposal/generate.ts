/**
 * Proposal generator — server-side minting (Session D / D3, spec §11).
 *
 * SERVER-ONLY (writes the RLS service-role-only proposals table). Turns a
 * prospect record into a gated /p/[slug] proposal in one step:
 *   • reuses the prospect's linked territory's ALREADY-STORED formula-v2 output
 *     (addressable_patients_primary) — never a new producer;
 *   • derives new_patients_range from the penetration constants (Rule 6 import);
 *   • mints an unguessable slug + a memorable access code (hashed at rest, gate.ts).
 *
 * Legal-flagged fields are NULL by deliberate choice (Trace, 2026-07-05, consistent
 * with standing #68/#71 — implementation detail, no new decision-log entry):
 *   • demand_matrix (#68 age/sex B01001) — NULL; only a future territory-carried
 *     cohort structure would populate it. No producer built here.
 *   • scenario_outputs (#71 illustrative revenue) — NULL; no per-prospect earnings
 *     figures are fabricated. Revenue/ROI blocks render as pending.
 *
 * Nothing here changes the no-live-prospect-send posture; the minted copy is a
 * placeholder-approved draft (see generate-copy.ts).
 */
import { createServiceClient } from '../supabase/service'
import { generateSalt, hashAccessCode } from './gate'
import { buildProposalSlug, salutationFor } from './generate-copy'
import { PENETRATION_RATE_LOW, PENETRATION_RATE_HIGH } from '../../../lib/addressable-market-constants'
import { randomBytes } from 'node:crypto'

/** Public base for the proposal link; overridable per environment. */
const PROPOSAL_BASE_URL =
  process.env.NEXT_PUBLIC_PROPOSAL_BASE_URL ?? 'https://ghmdsalesplatform.netlify.app'

/** Unambiguous alphabet for access codes (no O/0, I/1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomCodeChunk(len: number): string {
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out
}

/** Memorable, unambiguous access code, e.g. "GHMD-7KQ4". */
function generateAccessCode(): string {
  return `GHMD-${randomCodeChunk(4)}`
}

export interface GenerateOutcome {
  ok: boolean
  error?: string
  slug?: string
  /** Plaintext access code — returned ONCE to the authed rep; only the hash is stored. */
  accessCode?: string
  url?: string
  salutation?: string
  practiceName?: string | null
  territoryName?: string | null
  /** True when the prospect already had a proposal and we re-minted its access code. */
  regenerated?: boolean
}

interface TerritoryRow {
  name: string | null
  addressable_patients_primary: number | null
  center_lat: number | null
  center_lng: number | null
}

function preparedMonth(nowMs: number): string {
  return new Date(nowMs).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

/** Reserve a slug not already taken (bounded retries). */
async function uniqueSlug(
  db: ReturnType<typeof createServiceClient>,
  name: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = buildProposalSlug(name, randomBytes(3).toString('hex'))
    const { data } = await db.from('proposals').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
  }
  // Extremely unlikely; fall back to a longer suffix.
  return buildProposalSlug(name, randomBytes(6).toString('hex'))
}

/**
 * Create (or re-mint the access code for) a prospect's proposal. Returns the
 * public slug + a one-time plaintext access code.
 */
export async function createProposalForProspect(
  prospectId: string,
  nowMs: number = Date.now(),
): Promise<GenerateOutcome> {
  const db = createServiceClient()

  const { data: prospect, error: pErr } = await db
    .from('prospects')
    .select('id, full_name, practice_name, specialty')
    .eq('id', prospectId)
    .maybeSingle()
  if (pErr) return { ok: false, error: pErr.message }
  if (!prospect) return { ok: false, error: 'prospect not found' }

  // Most-recent linked territory (via deals), if any.
  const { data: deal } = await db
    .from('deals')
    .select('territories(name, addressable_patients_primary, center_lat, center_lng)')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const tRaw = deal?.territories as TerritoryRow | TerritoryRow[] | null
  const territory = Array.isArray(tRaw) ? (tRaw[0] ?? null) : (tRaw ?? null)

  const total = territory?.addressable_patients_primary ?? null
  const newPatientsLow = total != null ? Math.round(PENETRATION_RATE_LOW * total) : null
  const newPatientsHigh = total != null ? Math.round(PENETRATION_RATE_HIGH * total) : null

  const accessCode = generateAccessCode()
  const salt = generateSalt()
  const access_code_hash = hashAccessCode(accessCode, salt)

  // Snapshot fields shared by insert + update paths. Legal-flagged fields stay NULL.
  const snapshot = {
    prospect_name_full: prospect.full_name,
    practice_name: prospect.practice_name,
    specialty: prospect.specialty,
    territory_name: territory?.name ?? null,
    prepared_month: preparedMonth(nowMs),
    territory_pin_lat: territory?.center_lat ?? null,
    territory_pin_lng: territory?.center_lng ?? null,
    addressable_market_total: total,
    addressable_market_male_pct: null,
    addressable_market_female_pct: null,
    demand_matrix: null,
    new_patients_range_low: newPatientsLow,
    new_patients_range_high: newPatientsHigh,
    scenario_inputs: null,
    scenario_outputs: null,
    access_code_hash,
    access_code_salt: salt,
    updated_at: new Date(nowMs).toISOString(),
  }

  const common = {
    slug: '' as string,
    salutation: salutationFor(prospect.full_name),
    practiceName: prospect.practice_name as string | null,
    territoryName: territory?.name ?? null,
  }

  // Existing proposal for this prospect? (1:1 unique) → re-mint the access code.
  const { data: existing } = await db
    .from('proposals')
    .select('slug')
    .eq('prospect_id', prospectId)
    .maybeSingle()

  if (existing?.slug) {
    const { error: uErr } = await db.from('proposals').update(snapshot).eq('prospect_id', prospectId)
    if (uErr) return { ok: false, error: uErr.message }
    return {
      ok: true,
      slug: existing.slug,
      accessCode,
      url: `${PROPOSAL_BASE_URL}/p/${existing.slug}`,
      salutation: common.salutation,
      practiceName: common.practiceName,
      territoryName: common.territoryName,
      regenerated: true,
    }
  }

  const slug = await uniqueSlug(db, prospect.practice_name || prospect.full_name)
  const { error: iErr } = await db.from('proposals').insert({ prospect_id: prospectId, slug, ...snapshot })
  if (iErr) return { ok: false, error: iErr.message }

  return {
    ok: true,
    slug,
    accessCode,
    url: `${PROPOSAL_BASE_URL}/p/${slug}`,
    salutation: common.salutation,
    practiceName: common.practiceName,
    territoryName: common.territoryName,
    regenerated: false,
  }
}
