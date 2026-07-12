import { DEAL_STATUSES, isDealStatus, type DealStatus } from './pipeline-stages'

/**
 * Group prospects by deal health (active / stalled / lost) for the Prospects list
 * redesign. Deal-status grouping is deliberately distinct from Pipeline (stage) and
 * Dashboard (engagement) — it surfaces stalled/lost deals neither of those foregrounds.
 *
 * A missing / null / unrecognized deal_status falls back to 'active', matching the DB
 * column default (`deal_status text not null default 'active'`).
 */
export function groupProspectsByDealStatus<T extends { deal_status?: string | null }>(
  rows: T[],
): Record<DealStatus, T[]> {
  const grouped = Object.fromEntries(
    DEAL_STATUSES.map((s) => [s, [] as T[]]),
  ) as Record<DealStatus, T[]>

  for (const row of rows) {
    const status = isDealStatus(row.deal_status) ? row.deal_status : 'active'
    grouped[status].push(row)
  }
  return grouped
}
