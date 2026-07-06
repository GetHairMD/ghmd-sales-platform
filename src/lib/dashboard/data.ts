/**
 * Dashboard + timeline data access (SERVER-ONLY, spec §8 / §11).
 *
 * Reads the RLS service-role-only proposal_* tables via the shared service
 * client, then hands rows to the PURE derivations in ./triggers and
 * ../proposal/timeline. All ranking/aggregation logic lives in those pure
 * modules (unit-tested); this file only fetches and shapes.
 */
import { createServiceClient } from '../supabase/service'
import { PIPELINE_STAGES } from '../pipeline-stages'
import {
  aggregateEngagement,
  computeEngagementFeed,
  computeHotLeads,
  type FeedItem,
  type HotLead,
  type ProposalEventRow,
  type ProposalSessionRow,
  type ProspectDisplay,
} from './triggers'
import type { TimelineEventRow, TimelineSessionRow } from '../proposal/timeline'

export interface StageCount {
  id: number
  label: string
  count: number
}

export interface DashboardData {
  stageCounts: StageCount[]
  totalActive: number
  feed: FeedItem[]
  hotLeads: HotLead[]
}

interface ProspectRow {
  id: string
  full_name: string
  practice_name: string | null
  stage: number | null
  deal_status: string | null
}

export async function getDashboardData(nowMs: number = Date.now()): Promise<DashboardData> {
  const db = createServiceClient()

  const [{ data: prospects }, { data: events }, { data: sessions }] = await Promise.all([
    db.from('prospects').select('id, full_name, practice_name, stage, deal_status').eq('archived', false),
    db.from('proposal_events').select('prospect_id, event_type, payload, created_at'),
    db.from('proposal_sessions').select('prospect_id, started_at'),
  ])

  const rows = (prospects ?? []) as ProspectRow[]

  // Stage summary strip — one cell per pipeline position (spec §8).
  const counts = new Map<number, number>()
  for (const p of rows) {
    if (p.stage == null) continue
    counts.set(p.stage, (counts.get(p.stage) ?? 0) + 1)
  }
  const stageCounts: StageCount[] = PIPELINE_STAGES.map((s) => ({
    id: s.id,
    label: s.label,
    count: counts.get(s.id) ?? 0,
  }))

  // Engagement feed + hot leads — exclude lost deals from the heat surfaces.
  const display: ProspectDisplay[] = rows
    .filter((p) => p.deal_status !== 'lost')
    .map((p) => ({ id: p.id, full_name: p.full_name, practice_name: p.practice_name }))

  const engagements = aggregateEngagement(
    (events ?? []) as ProposalEventRow[],
    (sessions ?? []) as ProposalSessionRow[],
    display,
  )

  return {
    stageCounts,
    totalActive: rows.filter((p) => p.deal_status !== 'lost').length,
    feed: computeEngagementFeed(engagements, nowMs),
    hotLeads: computeHotLeads(engagements, nowMs),
  }
}

/** Proposal-side timeline sources for one prospect (spec §11). */
export async function getProspectTimelineSources(
  prospectId: string,
): Promise<{ events: TimelineEventRow[]; sessions: TimelineSessionRow[] }> {
  const db = createServiceClient()
  const [{ data: events }, { data: sessions }] = await Promise.all([
    db
      .from('proposal_events')
      .select('id, event_type, payload, created_at')
      .eq('prospect_id', prospectId),
    db.from('proposal_sessions').select('id, started_at').eq('prospect_id', prospectId),
  ])
  return {
    events: (events ?? []) as TimelineEventRow[],
    sessions: (sessions ?? []) as TimelineSessionRow[],
  }
}
