/**
 * Dashboard + timeline data access (SERVER-ONLY, spec §8 / §11).
 *
 * Reads the RLS service-role-only proposal_* tables via the shared service
 * client, then hands rows to the PURE derivations in ./triggers and
 * ../proposal/timeline. All ranking/aggregation logic lives in those pure
 * modules (unit-tested); this file only fetches and shapes.
 */
import { createServiceClient } from '../supabase/service'
import { PIPELINE_STAGES, STAGE, stageLabel } from '../pipeline-stages'
import {
  aggregateEngagement,
  computeEngagementFeed,
  computeHotLeads,
  computeMultiDealFeed,
  computeResourceFeed,
  type FeedItem,
  type HotLead,
  type MultiDealRow,
  type ProposalEventRow,
  type ProposalSessionRow,
  type ProspectDisplay,
  type ResourceOpenEventRow,
  type ResourceProspect,
  type ResourceShareLink,
  type ResourceViewer,
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
  /** Live proposals attached to non-lost prospects (spec §4B KPI: "active proposals"). */
  activeProposals: number
  /** Prospects at Funded/Won or later (stage ≥ 10) — the honest "closed" figure. */
  wonCount: number
  feed: FeedItem[]
  hotLeads: HotLead[]
}

interface ProspectRow {
  id: string
  full_name: string
  practice_name: string | null
  stage: number | null
  deal_status: string | null
  assigned_rep_id: string | null
}

/**
 * @param viewer  who is looking — drives the Resource Library feed's rep-own vs exec-all
 *   split (AC8a/AC8b). Defaults to a null viewer (no resource items), so any caller that
 *   forgets to pass it fails closed rather than leaking every rep's opens.
 */
export async function getDashboardData(
  viewer: ResourceViewer = { designation: null, userId: null },
  nowMs: number = Date.now(),
): Promise<DashboardData> {
  const db = createServiceClient()

  const [
    { data: prospects },
    { data: events },
    { data: sessions },
    { data: proposals },
    { data: resourceEvents },
    { data: resourceShares },
    { data: resourceAssets },
    { data: internalUsers },
    { data: dealRows },
  ] = await Promise.all([
    db
      .from('prospects')
      .select('id, full_name, practice_name, stage, deal_status, assigned_rep_id')
      .eq('archived', false),
    db.from('proposal_events').select('prospect_id, event_type, payload, created_at'),
    db.from('proposal_sessions').select('prospect_id, started_at'),
    db.from('proposals').select('prospect_id'),
    db.from('resource_engagement_events').select('share_id, created_at'),
    db.from('resource_shares').select('id, rep_id, prospect_id, asset_id'),
    db.from('resource_assets').select('id, title'),
    // Service-role read bypasses internal_users' self_read RLS, so exec attribution can
    // resolve any rep's name directly — no SECURITY DEFINER helper needed here.
    db.from('internal_users').select('user_id, full_name'),
    // Multi-deal feed source (brief §8): every non-lost deal + its territory name.
    // Role-scoping happens in computeMultiDealFeed (rep-own vs exec-all, fail closed).
    db.from('deals').select('prospect_id, stage, deal_status, funded_won_at, territories(name)'),
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

  // Active proposals: live proposal rows attached to a non-lost prospect.
  const nonLostIds = new Set(rows.filter((p) => p.deal_status !== 'lost').map((p) => p.id))
  const activeProposals = ((proposals ?? []) as { prospect_id: string }[]).filter((pr) =>
    nonLostIds.has(pr.prospect_id),
  ).length

  // Won: prospects that have reached Funded/Won (stage 10) or later.
  const wonCount = rows.filter(
    (p) => p.stage != null && p.stage >= STAGE.FUNDED_WON && p.deal_status !== 'lost',
  ).length

  // Resource Library feed contribution (E-3, AC8a/AC8b). Role-scoped in computeResourceFeed:
  // a rep sees opens on their OWN prospects only; an executive sees all, rep-attributed.
  // Lost prospects are excluded here too (same as the proposal heat surfaces).
  const prospectById: Record<string, ResourceProspect> = {}
  for (const p of rows) {
    if (p.deal_status === 'lost') continue
    prospectById[p.id] = {
      who: p.practice_name ? `${p.full_name} · ${p.practice_name}` : p.full_name,
      assignedRepId: p.assigned_rep_id,
    }
  }
  const assetTitleById: Record<string, string> = {}
  for (const a of (resourceAssets ?? []) as { id: string; title: string }[]) {
    assetTitleById[a.id] = a.title
  }
  const repNameById: Record<string, string> = {}
  for (const u of (internalUsers ?? []) as { user_id: string; full_name: string | null }[]) {
    if (u.full_name) repNameById[u.user_id] = u.full_name
  }

  const resourceFeed = computeResourceFeed({
    events: (resourceEvents ?? []) as ResourceOpenEventRow[],
    shares: (resourceShares ?? []) as ResourceShareLink[],
    assetTitleById,
    prospectById,
    repNameById,
    viewer,
  })

  // Multi-deal feed contribution (brief §8): a Funded/Won customer's in-flight
  // second negotiation must not go invisible just because the customer-level
  // stage stays at 11. Same role-scoping as the resource feed.
  type DealFeedRaw = {
    prospect_id: string
    stage: number
    deal_status: string
    funded_won_at: string | null
    territories: { name: string } | { name: string }[] | null
  }
  const multiDealRows: MultiDealRow[] = ((dealRows ?? []) as DealFeedRaw[]).map((d) => {
    const t = Array.isArray(d.territories) ? (d.territories[0] ?? null) : d.territories
    return {
      prospect_id: d.prospect_id,
      stage: d.stage,
      deal_status: d.deal_status,
      funded_won_at: d.funded_won_at,
      territory_name: t?.name ?? null,
    }
  })
  const multiDealFeed = computeMultiDealFeed({
    deals: multiDealRows,
    prospectById,
    stageLabelFor: stageLabel,
    fundedWonStage: STAGE.FUNDED_WON,
    viewer,
  })

  // Merge the proposal-engagement, resource-open, and multi-deal items into one
  // heat-sorted feed. computeEngagementFeed is asked for a generous slice so the
  // merge is fair, then the combined list is re-sorted and capped to the display limit.
  const feed = [...computeEngagementFeed(engagements, nowMs, 24), ...resourceFeed, ...multiDealFeed]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12)

  return {
    stageCounts,
    totalActive: rows.filter((p) => p.deal_status !== 'lost').length,
    activeProposals,
    wonCount,
    feed,
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
