/**
 * Rep Command Center — PURE per-rep metric derivations (spec §4D, decision #169).
 *
 * Executive-only management view: who's closing, how money is actually moving
 * (gross list vs. net actual, discount economics), and how each rep is working
 * the pipeline. All aggregation logic lives HERE (unit-tested, no I/O); the
 * server-only ./data module fetches rows and calls in. Mirrors the
 * dashboard triggers/data split.
 *
 * Money figures use TERRITORY_STANDARD_PRICE — the single-source $179,000
 * constant (components/proposal/constants.ts, scoreboard precedent). Never
 * inline the price.
 */
import { TERRITORY_STANDARD_PRICE } from '../../components/proposal/constants'
import { STAGE, FUNDING_PREQUAL_GATE_STAGE } from '../pipeline-stages'

/**
 * Discount reason categories — MUST stay in lockstep with the
 * deals_discount_reason_check CHECK constraint in migration
 * 20260716120000_4d_discount_governance.sql (pinned by a source-scan test).
 * The spec's "four reason categories" plus the explicit 'other' catch-all.
 */
export const DISCOUNT_REASONS = [
  'speed_to_close',
  'kol_political_sway',
  'strategic_deal',
  'multi_territory',
  'other',
] as const
export type DiscountReason = (typeof DISCOUNT_REASONS)[number]

export const DISCOUNT_REASON_LABELS: Record<DiscountReason, string> = {
  speed_to_close: 'Speed to close',
  kol_political_sway: 'KOL / political sway',
  strategic_deal: 'Strategic deal',
  multi_territory: 'Multi-territory',
  other: 'Other',
}

export function isDiscountReason(v: unknown): v is DiscountReason {
  return typeof v === 'string' && (DISCOUNT_REASONS as readonly string[]).includes(v)
}

// ── Input row shapes (narrow projections of the source tables) ───────────────

export interface RepRosterRow {
  user_id: string
  full_name: string | null
  /** internal_users.created_at — tenure start-date PROXY (spec §4D: no real hire date exists). */
  created_at: string
}

export interface ProspectMetricRow {
  id: string
  assigned_rep_id: string | null
  created_at: string
  funded_won_at: string | null
  stage: number | null
  deal_status: string | null
  skipped_funding_prequal: boolean
  full_name: string
  practice_name: string | null
}

export interface DealMetricRow {
  id: string
  prospect_id: string
  territory_id: string | null
  territory_price: number | null
  discount_reason: string | null
  created_at: string
}

export interface TerritoryMetricRow {
  id: string
  name: string
  addressable_patients_primary: number | null
}

export interface ProposalEventMetricRow {
  prospect_id: string
}

export interface ResourceShareMetricRow {
  id: string
  rep_id: string
}

export interface ResourceOpenMetricRow {
  share_id: string
}

/** call_scores = the rep's SELF score; rep_call_grades = the executive's grade.
 * Neither table carries a rep id — both attribute to a rep via the prospect's
 * assigned_rep_id. Both are empty today (spec §4D: "ready the moment either
 * gets populated", incl. the Phase-2 Whisper/Claude scoring pipeline). */
export interface CallScoreMetricRow {
  prospect_id: string
  total_score: number | null
}

export interface OutreachTouchMetricRow {
  prospect_id: string
  touch_date: string
}

export interface RepCommandCenterInputs {
  reps: RepRosterRow[]
  prospects: ProspectMetricRow[]
  deals: DealMetricRow[]
  territories: TerritoryMetricRow[]
  proposalEvents: ProposalEventMetricRow[]
  resourceShares: ResourceShareMetricRow[]
  resourceOpens: ResourceOpenMetricRow[]
  selfScores: CallScoreMetricRow[]
  execGrades: CallScoreMetricRow[]
  outreachTouches: OutreachTouchMetricRow[]
}

// ── Output shapes ─────────────────────────────────────────────────────────────

/** One closed deal in the per-rep drill-down (SlideOverDetailPanel). */
export interface RepDealDetail {
  dealId: string
  prospectName: string
  practiceName: string | null
  territoryName: string | null
  /**
   * The price counted toward net for this close. Either the real
   * `deals.territory_price` (when `priceConfirmed`) or the $179,000 list-price
   * ASSUMPTION used when no price is on record (see `priceConfirmed`).
   */
  price: number
  /**
   * TRUE only when a deal row exists AND its `territory_price` is non-null — i.e.
   * `price` is a confirmed figure. FALSE when the price was ASSUMED because the
   * prospect has no deal row, or the deal's `territory_price` is NULL (a real,
   * allowed schema state — see the migration's economics-CHECK null comment).
   * The Gross-vs-Net split exists to show real discount reality, so "no price on
   * record" must read as a data gap, NOT as a confirmed $179,000 zero-discount
   * close. An assumed price is never marked `discounted`.
   */
  priceConfirmed: boolean
  discounted: boolean
  discountReason: DiscountReason | null
  /** prospects.created_at → funded_won_at, whole days. */
  cycleDays: number | null
  /** Territory addressable-market figure (addressable_patients_primary). */
  addressable: number | null
  /** Territory-quality-normalized deal size: price ÷ addressable (spec §4D). */
  pricePerAddressable: number | null
  closedAt: string
}

export interface RepMetrics {
  repId: string
  /** full_name with the provisioning-rule fallback — never null/"null" in UI. */
  name: string
  tenureDays: number
  assignedCount: number
  closedCount: number
  /** closedCount × $179,000 list (spec §4D "Gross"). */
  grossRevenue: number
  /** Σ actual deals.territory_price over closes (spec §4D "Net" — discount-aware). */
  netRevenue: number
  discountedCount: number
  /**
   * DEFENSIVE FALLBACK — expected to always be 0 in practice. Counts closes whose
   * price was ASSUMED (no deal row / NULL territory_price, `priceConfirmed === false`).
   * The database now FORBIDS that state at close: stamp_prospect_funded_won() rejects
   * the Funded/Won crossing unless a priced deals row exists, and deals.territory_price
   * is NOT NULL (migration 20260716140000). These fields are kept — and still computed —
   * only so this pure function stays honest if a should-not-occur row ever reaches it
   * (e.g. legacy/out-of-band data); the Rep Command Center UI no longer renders a
   * warning for them (see RepCommandCenterView.tsx), because the state can't occur.
   */
  dataGapCount: number
  /** Dollars inside `netRevenue` from assumed prices. See dataGapCount — expected 0. */
  dataGapRevenue: number
  /** % of closes below list; null when there are no closes. */
  discountFrequencyPct: number | null
  discountByReason: Record<DiscountReason, number>
  /** Avg prospects.created_at → funded_won_at, days; null when no closes. */
  avgCycleDays: number | null
  /** won ÷ ALL assigned (spec: "overall"); null when nothing assigned. */
  closingRateOverallPct: number | null
  /** won ÷ reached Proposal Sent (spec: "stage-qualified"); null when none reached. */
  closingRateQualifiedPct: number | null
  reachedProposalCount: number
  /** prospects.deal_status mix (active/stalled/lost). */
  dealHealth: { active: number; stalled: number; lost: number }
  /** skipped_funding_prequal among assigned prospects at/past the funding gate stage. */
  prequalSkipRatePct: number | null
  prequalGateCount: number
  prequalSkippedCount: number
  /** Engagement: proposal_events on the rep's prospects + E-3 share activity. */
  proposalEventCount: number
  resourceShareCount: number
  resourceOpenCount: number
  /** Self-score vs exec-score (call_scores / rep_call_grades) — null until populated. */
  selfScoreAvg: number | null
  execScoreAvg: number | null
  /** self − exec; positive = rep rates themselves above their exec grade. */
  scoreDelta: number | null
  /** APPROXIMATE speed-to-lead, days (see computeSpeedToLead). */
  speedToLeadDays: number | null
  speedToLeadSampleSize: number
  /** Avg $/addressable patient across closes with a sized territory. */
  avgPricePerAddressable: number | null
  deals: RepDealDetail[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000

/** UI rule for nullable internal_users.full_name (Rep Provisioning, CLAUDE.md):
 * fall back to a generic label — never crash, never render "null". */
export function repDisplayName(fullName: string | null): string {
  const trimmed = fullName?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed rep'
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return Math.max(0, (to - from) / MS_PER_DAY)
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return (numerator / denominator) * 100
}

/**
 * ⚠ APPROXIMATION, flagged per spec §4D: there is no explicit "assigned at"
 * timestamp anywhere in the schema, so speed-to-lead is proxied as
 * prospects.created_at → the FIRST outreach_touches row for that prospect
 * (touch_date), clamped at 0 for back-dated touches. It measures
 * creation-to-first-touch, not assignment-to-first-touch — a prospect created
 * long before assignment will read slower than the rep truly was. Replace the
 * proxy when a real assignment timestamp exists.
 */
export function computeSpeedToLead(
  prospects: ProspectMetricRow[],
  firstTouchByProspect: Map<string, string>,
): { avgDays: number | null; sampleSize: number } {
  const deltas: number[] = []
  for (const p of prospects) {
    const firstTouch = firstTouchByProspect.get(p.id)
    if (!firstTouch) continue
    const d = daysBetween(p.created_at, firstTouch)
    if (d !== null) deltas.push(d)
  }
  return { avgDays: avg(deltas), sampleSize: deltas.length }
}

function emptyReasonBreakdown(): Record<DiscountReason, number> {
  return {
    speed_to_close: 0,
    kol_political_sway: 0,
    strategic_deal: 0,
    multi_territory: 0,
    other: 0,
  }
}

// ── Main derivation ───────────────────────────────────────────────────────────

/**
 * Per-rep §4D metrics. Scope: reps only (internal_users.designation='rep') —
 * executives are graders here, not graded; the roster passed in is already
 * rep-filtered by ./data.
 *
 * Close definition: prospects.funded_won_at IS NOT NULL — the durable stage≥11
 * crossing stamped only by stamp_prospect_funded_won() (E-0b/E-1 precedent;
 * scoreboard_summary counts closes the same way). Deliberately NOT filtered by
 * deal_status: a close is a historical fact even if the account later stalls.
 *
 * Deal association: a prospect's MOST RECENT deals row (created_at desc) — the
 * same "latest deal wins" read the proposal page uses. A closed prospect with
 * no deals row contributes the $179,000 list price to net (the deals column
 * default) and cannot be discounted.
 *
 * "Reached Proposal Sent" is approximated from the CURRENT stage
 * (stage ≥ STAGE.PROPOSAL_SENT, or already closed): prospects.stage is a live
 * position, not a history — a prospect moved backward past the boundary drops
 * out. No stage-transition log exists yet to do better.
 */
export function computeRepCommandCenterMetrics(
  inputs: RepCommandCenterInputs,
  nowMs: number,
): RepMetrics[] {
  const {
    reps,
    prospects,
    deals,
    territories,
    proposalEvents,
    resourceShares,
    resourceOpens,
    selfScores,
    execGrades,
    outreachTouches,
  } = inputs

  // Latest deal per prospect (created_at desc, id as a deterministic tiebreak).
  const latestDealByProspect = new Map<string, DealMetricRow>()
  for (const d of deals) {
    const cur = latestDealByProspect.get(d.prospect_id)
    if (!cur || d.created_at > cur.created_at || (d.created_at === cur.created_at && d.id > cur.id)) {
      latestDealByProspect.set(d.prospect_id, d)
    }
  }

  const territoryById = new Map(territories.map((t) => [t.id, t]))

  const prospectsByRep = new Map<string, ProspectMetricRow[]>()
  const repIdByProspect = new Map<string, string>()
  for (const p of prospects) {
    if (!p.assigned_rep_id) continue
    const list = prospectsByRep.get(p.assigned_rep_id)
    if (list) list.push(p)
    else prospectsByRep.set(p.assigned_rep_id, [p])
    repIdByProspect.set(p.id, p.assigned_rep_id)
  }

  const proposalEventCountByRep = new Map<string, number>()
  for (const e of proposalEvents) {
    const repId = repIdByProspect.get(e.prospect_id)
    if (!repId) continue
    proposalEventCountByRep.set(repId, (proposalEventCountByRep.get(repId) ?? 0) + 1)
  }

  // E-3 share activity: resource_shares.rep_id is server-stamped (trigger), so it
  // is the trustworthy share-creator attribution; opens attribute to the share's rep.
  const shareCountByRep = new Map<string, number>()
  const shareRepById = new Map<string, string>()
  for (const s of resourceShares) {
    shareCountByRep.set(s.rep_id, (shareCountByRep.get(s.rep_id) ?? 0) + 1)
    shareRepById.set(s.id, s.rep_id)
  }
  const openCountByRep = new Map<string, number>()
  for (const o of resourceOpens) {
    const repId = shareRepById.get(o.share_id)
    if (!repId) continue
    openCountByRep.set(repId, (openCountByRep.get(repId) ?? 0) + 1)
  }

  const selfScoresByRep = new Map<string, number[]>()
  for (const s of selfScores) {
    const repId = repIdByProspect.get(s.prospect_id)
    if (!repId || s.total_score === null) continue
    const list = selfScoresByRep.get(repId)
    if (list) list.push(s.total_score)
    else selfScoresByRep.set(repId, [s.total_score])
  }
  const execGradesByRep = new Map<string, number[]>()
  for (const g of execGrades) {
    const repId = repIdByProspect.get(g.prospect_id)
    if (!repId || g.total_score === null) continue
    const list = execGradesByRep.get(repId)
    if (list) list.push(g.total_score)
    else execGradesByRep.set(repId, [g.total_score])
  }

  // First touch per prospect for the speed-to-lead proxy.
  const firstTouchByProspect = new Map<string, string>()
  for (const t of outreachTouches) {
    const cur = firstTouchByProspect.get(t.prospect_id)
    if (!cur || t.touch_date < cur) firstTouchByProspect.set(t.prospect_id, t.touch_date)
  }

  return reps.map((rep) => {
    const assigned = prospectsByRep.get(rep.user_id) ?? []
    const closed = assigned.filter((p) => p.funded_won_at !== null)
    const reachedProposal = assigned.filter(
      (p) => (p.stage !== null && p.stage >= STAGE.PROPOSAL_SENT) || p.funded_won_at !== null,
    )

    // Per-close deal economics.
    const discountByReason = emptyReasonBreakdown()
    let netRevenue = 0
    let discountedCount = 0
    let dataGapCount = 0
    let dataGapRevenue = 0
    const cycleDays: number[] = []
    const pricePerAddressableSamples: number[] = []
    const dealDetails: RepDealDetail[] = []

    for (const p of closed) {
      const deal = latestDealByProspect.get(p.id)
      // A confirmed price requires a deal row AND a non-null territory_price.
      // Missing deal row OR NULL territory_price → the $179,000 figure is an
      // ASSUMPTION, not a confirmed close (`??` alone would hide that). Both are
      // still counted in netRevenue so the total stays complete; the gap is
      // surfaced via priceConfirmed / dataGapCount / dataGapRevenue instead.
      const confirmedPrice = deal?.territory_price ?? null
      const priceConfirmed = confirmedPrice !== null
      const price = confirmedPrice ?? TERRITORY_STANDARD_PRICE
      // Only a CONFIRMED price can be "discounted" — an assumed list price is a
      // data gap, never a real zero/negative discount signal.
      const discounted = priceConfirmed && price < TERRITORY_STANDARD_PRICE
      const reason = discounted && isDiscountReason(deal?.discount_reason)
        ? deal.discount_reason
        : null
      netRevenue += price
      if (!priceConfirmed) {
        dataGapCount += 1
        dataGapRevenue += price
      }
      if (discounted) {
        discountedCount += 1
        // A discounted deal always carries a reason at the DB (CHECK); 'other'
        // here only if the read row somehow lacks one (defensive, not expected).
        discountByReason[reason ?? 'other'] += 1
      }

      const cycle = p.funded_won_at ? daysBetween(p.created_at, p.funded_won_at) : null
      if (cycle !== null) cycleDays.push(cycle)

      const territory = deal?.territory_id ? territoryById.get(deal.territory_id) : undefined
      const addressable = territory?.addressable_patients_primary ?? null
      // Only a confirmed price yields a real $/addressable figure — an assumed
      // list price would fabricate the normalized number just as it would net.
      const perAddressable =
        priceConfirmed && addressable !== null && addressable > 0 ? price / addressable : null
      if (perAddressable !== null) pricePerAddressableSamples.push(perAddressable)

      dealDetails.push({
        dealId: deal?.id ?? p.id,
        prospectName: p.full_name,
        practiceName: p.practice_name,
        territoryName: territory?.name ?? null,
        price,
        priceConfirmed,
        discounted,
        discountReason: reason,
        cycleDays: cycle !== null ? Math.round(cycle) : null,
        addressable,
        pricePerAddressable: perAddressable,
        closedAt: p.funded_won_at as string,
      })
    }
    dealDetails.sort((a, b) => (a.closedAt < b.closedAt ? 1 : -1))

    const dealHealth = { active: 0, stalled: 0, lost: 0 }
    for (const p of assigned) {
      if (p.deal_status === 'active') dealHealth.active += 1
      else if (p.deal_status === 'stalled') dealHealth.stalled += 1
      else if (p.deal_status === 'lost') dealHealth.lost += 1
    }

    // Prequal skip rate among prospects that are at/past the funding gate stage —
    // the population for which skipping was even possible (mirrors
    // showPrequalSkippedBadge's stage predicate).
    const atGate = assigned.filter(
      (p) => p.stage !== null && p.stage >= FUNDING_PREQUAL_GATE_STAGE,
    )
    const skipped = atGate.filter((p) => p.skipped_funding_prequal)

    const speedToLead = computeSpeedToLead(assigned, firstTouchByProspect)

    const selfAvg = avg(selfScoresByRep.get(rep.user_id) ?? [])
    const execAvg = avg(execGradesByRep.get(rep.user_id) ?? [])

    const tenure = daysBetween(rep.created_at, new Date(nowMs).toISOString())

    return {
      repId: rep.user_id,
      name: repDisplayName(rep.full_name),
      tenureDays: tenure !== null ? Math.floor(tenure) : 0,
      assignedCount: assigned.length,
      closedCount: closed.length,
      grossRevenue: closed.length * TERRITORY_STANDARD_PRICE,
      netRevenue,
      discountedCount,
      dataGapCount,
      dataGapRevenue,
      discountFrequencyPct: pct(discountedCount, closed.length),
      discountByReason,
      avgCycleDays: avg(cycleDays),
      closingRateOverallPct: pct(closed.length, assigned.length),
      closingRateQualifiedPct: pct(closed.length, reachedProposal.length),
      reachedProposalCount: reachedProposal.length,
      dealHealth,
      prequalSkipRatePct: pct(skipped.length, atGate.length),
      prequalGateCount: atGate.length,
      prequalSkippedCount: skipped.length,
      proposalEventCount: proposalEventCountByRep.get(rep.user_id) ?? 0,
      resourceShareCount: shareCountByRep.get(rep.user_id) ?? 0,
      resourceOpenCount: openCountByRep.get(rep.user_id) ?? 0,
      selfScoreAvg: selfAvg,
      execScoreAvg: execAvg,
      scoreDelta: selfAvg !== null && execAvg !== null ? selfAvg - execAvg : null,
      speedToLeadDays: speedToLead.avgDays,
      speedToLeadSampleSize: speedToLead.sampleSize,
      avgPricePerAddressable: avg(pricePerAddressableSamples),
      deals: dealDetails,
    }
  })
}
