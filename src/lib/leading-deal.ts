/**
 * Leading-deal resolution for customer-level stage moves (multi-deal build).
 *
 * The Pipeline board's customer card shows the DERIVED prospects.stage —
 * MAX(stage) over the prospect's non-lost deals. Dragging that card therefore
 * moves the LEADING deal: max stage, tiebroken to the most recently created.
 * An earlier-stage second deal is never moved implicitly by the board; it has
 * its own per-deal controls (deal-history panel, PR-B).
 */

export interface LeadingDealRow {
  id: string
  stage: number
  deal_status: string
  created_at: string
}

/** The deal a customer-level move targets, or null when no non-lost deal exists. */
export function resolveLeadingDeal<T extends LeadingDealRow>(deals: T[]): T | null {
  const open = deals.filter((d) => d.deal_status !== 'lost')
  if (open.length === 0) return null
  return open.reduce((best, d) => {
    if (d.stage > best.stage) return d
    if (d.stage === best.stage && d.created_at > best.created_at) return d
    return best
  })
}
