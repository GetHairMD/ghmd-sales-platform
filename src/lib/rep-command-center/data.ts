/**
 * Rep Command Center data access (SERVER-ONLY, spec §4D).
 *
 * Reads run through the shared SERVICE-ROLE client, for two structural reasons
 * (both established precedents, not new surface):
 *   • internal_users' only client SELECT policy is self_read, so no executive's
 *     own RLS-scoped client can read the rep roster (the /api/internal-users/reps
 *     precedent);
 *   • deals.discount_reason / discount_authorized_by are EXCLUDED from every
 *     authenticated column grant (migration 20260716120000) — concealment means
 *     even an executive's browser client cannot select them; only this
 *     server-side path can.
 *
 * THE FETCH IS THEREFORE NOT THE SECURITY BOUNDARY — THE CALLER'S EXECUTIVE GATE
 * IS. The single consumer is app/(app)/rep-command-center/page.tsx, which 404s
 * (not 403s — §4D concealment) every non-executive before this module is touched.
 * Same authorization shape as the dashboard's service-role reads.
 */
import { createServiceClient } from '../supabase/service'
import {
  computeRepCommandCenterMetrics,
  type CallScoreMetricRow,
  type DealMetricRow,
  type OutreachTouchMetricRow,
  type ProposalEventMetricRow,
  type ProspectMetricRow,
  type RepMetrics,
  type RepRosterRow,
  type ResourceOpenMetricRow,
  type ResourceShareMetricRow,
  type TerritoryMetricRow,
} from './metrics'

export interface RepCommandCenterData {
  reps: RepMetrics[]
}

/** Raw deals row — territory_price arrives as string (numeric) from PostgREST. */
interface DealRow {
  id: string
  prospect_id: string
  territory_id: string | null
  territory_price: number | string | null
  discount_reason: string | null
  created_at: string
}

export async function getRepCommandCenterData(nowMs: number = Date.now()): Promise<RepCommandCenterData> {
  const db = createServiceClient()

  // Each entry is [label, PostgREST result]. We check EVERY result's `error` below
  // and throw on the first failure — a broken query (RLS misconfig, transient
  // outage, schema drift) must NOT degrade to an empty view that is
  // indistinguishable from a genuinely-empty book. Throwing surfaces through the
  // page's server-component error handling instead of silently under-reporting
  // executive-facing revenue/performance numbers.
  const results = await Promise.all([
    // Scope: reps only (§4D — executives are graders, not graded).
    db
      .from('internal_users')
      .select('user_id, full_name, created_at')
      .eq('designation', 'rep')
      .order('full_name', { ascending: true, nullsFirst: false }),
    // archived=false mirrors the dashboard's working-set convention.
    db
      .from('prospects')
      .select(
        'id, assigned_rep_id, created_at, funded_won_at, stage, deal_status, skipped_funding_prequal, full_name, practice_name',
      )
      .eq('archived', false),
    db
      .from('deals')
      .select('id, prospect_id, territory_id, territory_price, discount_reason, created_at'),
    db.from('territories').select('id, name, addressable_patients_primary'),
    db.from('proposal_events').select('prospect_id'),
    db.from('resource_shares').select('id, rep_id'),
    db.from('resource_engagement_events').select('share_id'),
    db.from('call_scores').select('prospect_id, total_score'),
    db.from('rep_call_grades').select('prospect_id, total_score'),
    db.from('outreach_touches').select('prospect_id, touch_date'),
  ])

  const labels = [
    'internal_users',
    'prospects',
    'deals',
    'territories',
    'proposal_events',
    'resource_shares',
    'resource_engagement_events',
    'call_scores',
    'rep_call_grades',
    'outreach_touches',
  ] as const
  const failures = results
    .map((r, i) => (r.error ? `${labels[i]}: ${r.error.message}` : null))
    .filter((m): m is string => m !== null)
  if (failures.length > 0) {
    throw new Error(`getRepCommandCenterData: query failure(s) — ${failures.join('; ')}`)
  }

  const [
    { data: reps },
    { data: prospects },
    { data: deals },
    { data: territories },
    { data: proposalEvents },
    { data: resourceShares },
    { data: resourceOpens },
    { data: selfScores },
    { data: execGrades },
    { data: touches },
  ] = results

  const dealRows: DealMetricRow[] = ((deals ?? []) as DealRow[]).map((d) => ({
    id: d.id,
    prospect_id: d.prospect_id,
    territory_id: d.territory_id,
    // numeric → number; null stays null (metrics falls back to list price).
    territory_price: d.territory_price === null ? null : Number(d.territory_price),
    discount_reason: d.discount_reason,
    created_at: d.created_at,
  }))

  return {
    reps: computeRepCommandCenterMetrics(
      {
        reps: (reps ?? []) as RepRosterRow[],
        prospects: (prospects ?? []) as ProspectMetricRow[],
        deals: dealRows,
        territories: (territories ?? []) as TerritoryMetricRow[],
        proposalEvents: (proposalEvents ?? []) as ProposalEventMetricRow[],
        resourceShares: (resourceShares ?? []) as ResourceShareMetricRow[],
        resourceOpens: (resourceOpens ?? []) as ResourceOpenMetricRow[],
        selfScores: (selfScores ?? []) as CallScoreMetricRow[],
        execGrades: (execGrades ?? []) as CallScoreMetricRow[],
        outreachTouches: (touches ?? []) as OutreachTouchMetricRow[],
      },
      nowMs,
    ),
  }
}
