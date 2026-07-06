/**
 * Proposals-index data access (SERVER-ONLY, spec §4B nav item 4).
 *
 * Reads the RLS service-role-only proposal_* tables via the shared service
 * client, rolls engagement up with the PURE, unit-tested `aggregateEngagement`
 * (dashboard/triggers), then hands the rows to the PURE `buildProposalRows`.
 * Mirrors the dashboard convention: this file only fetches and shapes — all
 * aggregation/ordering logic lives in the pure modules.
 */
import { createServiceClient } from '../supabase/service'
import {
  aggregateEngagement,
  type ProposalEventRow,
  type ProposalSessionRow,
  type ProspectDisplay,
} from '../dashboard/triggers'
import { buildProposalRows, type ProposalListRow, type ProposalRecord } from './rows'

interface ProspectNameRow {
  id: string
  full_name: string
  practice_name: string | null
}

export async function getProposalsData(): Promise<ProposalListRow[]> {
  const db = createServiceClient()

  const { data: proposals } = await db
    .from('proposals')
    .select('id, slug, prospect_id, created_at')

  const records = (proposals ?? []) as ProposalRecord[]
  if (records.length === 0) return []

  // Only the prospects these proposals belong to — names + engagement sources.
  const prospectIds = Array.from(new Set(records.map((p) => p.prospect_id)))

  const [{ data: prospects }, { data: events }, { data: sessions }] = await Promise.all([
    db.from('prospects').select('id, full_name, practice_name').in('id', prospectIds),
    db.from('proposal_events').select('prospect_id, event_type, payload, created_at').in('prospect_id', prospectIds),
    db.from('proposal_sessions').select('prospect_id, started_at').in('prospect_id', prospectIds),
  ])

  const display: ProspectDisplay[] = ((prospects ?? []) as ProspectNameRow[]).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    practice_name: p.practice_name,
  }))

  const engagements = aggregateEngagement(
    (events ?? []) as ProposalEventRow[],
    (sessions ?? []) as ProposalSessionRow[],
    display,
  )

  return buildProposalRows(records, engagements)
}
