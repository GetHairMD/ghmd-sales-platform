/**
 * Prospect insert payload builder — pure and testable.
 *
 * Exists to make the "insert shape" verifiable without a live DB. The prior new-prospect
 * form wrote `stage: 'new_lead'` (a string into a NOT NULL integer column) and
 * `source_channel` (not a real column — the column is `lead_source`); both would fail on
 * the first real insert. Building the payload here, guarded against unknown columns and a
 * non-integer stage, catches that class of bug in a unit test.
 */

import { STAGE } from './pipeline-stages'

/** Columns a new-prospect insert is allowed to write. Must be real prospects columns. */
export const PROSPECT_INSERT_COLUMNS = [
  'full_name',
  'email',
  'phone',
  'practice_name',
  'website',
  'specialty',
  'lead_source',
  'lead_source_sub',
  'assigned_rep',
  'strong_connection',
  'referrer_id',
  'icp_score',
  'stage',
  'notes',
] as const

export interface NewProspectInput {
  full_name: string
  email?: string | null
  phone?: string | null
  /** Maps to the `lead_source` column (the UI field is labelled "Source Channel"). */
  lead_source?: string | null
  assigned_rep?: string
}

export interface ProspectInsert {
  full_name: string
  email: string | null
  phone: string | null
  lead_source: string | null
  assigned_rep: string
  stage: number
}

/**
 * Build a validated prospects insert payload. New prospects always enter at stage 1
 * (New Lead) as an integer. Throws if the payload would reference a non-existent column
 * or a non-integer stage — the exact failure the old form shipped silently.
 */
export function buildProspectInsert(input: NewProspectInput): ProspectInsert {
  const payload: ProspectInsert = {
    full_name: input.full_name,
    email: input.email || null,
    phone: input.phone || null,
    lead_source: input.lead_source || null,
    assigned_rep: input.assigned_rep || 'trace',
    stage: STAGE.NEW_LEAD,
  }

  for (const key of Object.keys(payload)) {
    if (!(PROSPECT_INSERT_COLUMNS as readonly string[]).includes(key)) {
      throw new Error(`buildProspectInsert: "${key}" is not a valid prospects column`)
    }
  }
  if (!Number.isInteger(payload.stage)) {
    throw new Error(`buildProspectInsert: stage must be an integer, got ${typeof payload.stage}`)
  }

  return payload
}
