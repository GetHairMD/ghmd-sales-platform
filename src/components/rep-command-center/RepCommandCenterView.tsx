'use client'

import { useState } from 'react'
import { AlertTriangle, BadgeDollarSign, Clock3, Flame, Gauge, Share2, Users } from 'lucide-react'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import StatCard from '@/components/ui/StatCard'
import SlideOverDetailPanel from '@/components/ui/SlideOverDetailPanel'
import { cn } from '@/design/cn'
import {
  DISCOUNT_REASON_LABELS,
  DISCOUNT_REASONS,
  type RepMetrics,
} from '@/lib/rep-command-center/metrics'

/**
 * Rep Command Center view (spec §4D) — executive-only; the page 404s every
 * non-executive before this component is ever streamed, so nothing here needs
 * its own gate. Pure presentation over the serialized RepMetrics.
 *
 * "Management tips" (spec §4D) is EXPLICIT BACKLOG — deliberately no UI element
 * and no placeholder here; scope when a concrete spec exists.
 */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function fmtPct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}%`
}

function fmtDays(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}d`
}

function fmtScore(v: number | null): string {
  return v === null ? '—' : v.toFixed(1)
}

/** Label/value line inside a rep card. */
function MetricRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-text-muted" title={hint}>
        {label}
      </span>
      <span className="text-sm font-medium text-text">{value}</span>
    </div>
  )
}

function DealHealthChips({ health }: { health: RepMetrics['dealHealth'] }) {
  const chips: { label: string; count: number; tone: string }[] = [
    { label: 'active', count: health.active, tone: 'bg-success/10 text-success' },
    { label: 'stalled', count: health.stalled, tone: 'bg-accent/15 text-accent' },
    { label: 'lost', count: health.lost, tone: 'bg-error/10 text-error' },
  ]
  return (
    <div className="flex gap-1.5">
      {chips.map((c) => (
        <span
          key={c.label}
          className={cn('rounded-full px-2 py-0.5 text-[0.6875rem] font-medium', c.tone)}
        >
          {c.count} {c.label}
        </span>
      ))}
    </div>
  )
}

function RepCard({ rep, onOpenDeals }: { rep: RepMetrics; onOpenDeals: (rep: RepMetrics) => void }) {
  const discountBreakdown = DISCOUNT_REASONS.filter((r) => rep.discountByReason[r] > 0)
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-lg font-bold text-text">{rep.name}</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Tenure {rep.tenureDays}d · {rep.assignedCount} assigned
          </p>
        </div>
        <DealHealthChips health={rep.dealHealth} />
      </header>

      {/* Money — gross list vs. net actual (discount-aware). */}
      <div className="grid grid-cols-2 gap-3 rounded-md bg-bg-subtle p-3">
        <div>
          <p className="font-heading text-[0.625rem] uppercase tracking-caps text-text-muted">Gross (list)</p>
          <p className="font-heading text-xl font-bold text-text">{usd.format(rep.grossRevenue)}</p>
        </div>
        <div>
          <p className="font-heading text-[0.625rem] uppercase tracking-caps text-text-muted">Net (actual)</p>
          <p
            className={cn(
              'font-heading text-xl font-bold',
              rep.netRevenue < rep.grossRevenue ? 'text-accent' : 'text-text',
            )}
          >
            {usd.format(rep.netRevenue)}
          </p>
          {/* Data-gap disclosure: assumed-price closes are in the total but
              unconfirmed — surface them so Net never reads as all-confirmed. */}
          {rep.dataGapCount > 0 && (
            <p
              className="mt-1 flex items-center gap-1 text-[0.6875rem] leading-snug text-warning"
              title="Closes with no price on record fall back to the $179,000 list price. That amount is assumed, not confirmed, and is not counted as a discount."
            >
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
              {usd.format(rep.dataGapRevenue)} unconfirmed · {rep.dataGapCount}{' '}
              {rep.dataGapCount === 1 ? 'deal' : 'deals'} with no price on record
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <MetricRow
          label="Closes"
          value={`${rep.closedCount} · ${fmtPct(rep.closingRateOverallPct)} overall`}
          hint="Funded/Won closes; rate = won ÷ all assigned"
        />
        <MetricRow
          label="Closing rate (stage-qualified)"
          value={`${fmtPct(rep.closingRateQualifiedPct)} of ${rep.reachedProposalCount} at Proposal+`}
          hint="won ÷ reached Proposal Sent — a different management question than overall"
        />
        <MetricRow
          label="Discount frequency"
          value={
            rep.discountedCount > 0
              ? `${fmtPct(rep.discountFrequencyPct)} (${rep.discountedCount})`
              : fmtPct(rep.discountFrequencyPct)
          }
          hint="% of closes below the $179,000 list price"
        />
        {discountBreakdown.length > 0 && (
          <p className="pl-3 text-[0.6875rem] leading-snug text-text-muted">
            {discountBreakdown
              .map((r) => `${DISCOUNT_REASON_LABELS[r]} ×${rep.discountByReason[r]}`)
              .join(' · ')}
          </p>
        )}
        <MetricRow label="Avg deal cycle" value={fmtDays(rep.avgCycleDays)} hint="prospect created → Funded/Won" />
        <MetricRow
          label="Speed to lead (approx.)"
          value={
            rep.speedToLeadSampleSize > 0
              ? `${fmtDays(rep.speedToLeadDays)} (n=${rep.speedToLeadSampleSize})`
              : '—'
          }
          hint="Proxy: prospect created → first outreach touch. No assignment timestamp exists yet."
        />
        <MetricRow
          label="Prequal skip rate"
          value={
            rep.prequalGateCount > 0
              ? `${fmtPct(rep.prequalSkipRatePct)} (${rep.prequalSkippedCount}/${rep.prequalGateCount})`
              : '—'
          }
          hint="skipped_funding_prequal among prospects at/past the funding gate"
        />
        <MetricRow
          label="Engagement"
          value={
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <Flame className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {rep.proposalEventCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <Share2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {rep.resourceShareCount} shared · {rep.resourceOpenCount} opened
              </span>
            </span>
          }
          hint="Proposal events on this rep's prospects · Resource Library shares/opens (E-3)"
        />
        <MetricRow
          label="Self vs. exec call score"
          value={
            rep.scoreDelta === null
              ? `${fmtScore(rep.selfScoreAvg)} / ${fmtScore(rep.execScoreAvg)}`
              : `${fmtScore(rep.selfScoreAvg)} / ${fmtScore(rep.execScoreAvg)} (Δ ${rep.scoreDelta > 0 ? '+' : ''}${rep.scoreDelta.toFixed(1)})`
          }
          hint="call_scores (self) vs rep_call_grades (exec) — populates with Phase-2 call scoring"
        />
        <MetricRow
          label="$/addressable patient"
          value={
            rep.avgPricePerAddressable === null ? '—' : `$${rep.avgPricePerAddressable.toFixed(2)}`
          }
          hint="Territory-quality-normalized deal size: price ÷ territory addressable market"
        />
      </div>

      <button
        type="button"
        onClick={() => onOpenDeals(rep)}
        disabled={rep.deals.length === 0}
        className={cn(
          'mt-auto rounded-md border border-mist px-3 py-2 text-sm font-medium transition-colors',
          rep.deals.length > 0
            ? 'text-primary hover:bg-primary/5'
            : 'cursor-default text-text-muted/60',
        )}
      >
        {rep.deals.length > 0 ? `View closed deals (${rep.deals.length})` : 'No closed deals yet'}
      </button>
    </Card>
  )
}

export default function RepCommandCenterView({ reps }: { reps: RepMetrics[] }) {
  const [openRep, setOpenRep] = useState<RepMetrics | null>(null)

  const totals = reps.reduce(
    (acc, r) => ({
      closes: acc.closes + r.closedCount,
      gross: acc.gross + r.grossRevenue,
      net: acc.net + r.netRevenue,
      discounted: acc.discounted + r.discountedCount,
    }),
    { closes: 0, gross: 0, net: 0, discounted: 0 },
  )

  return (
    <div className="space-y-6">
      {/* Org-level strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Reps"
          value={reps.length}
          icon={<Users className="h-4 w-4 text-text-muted" aria-hidden="true" />}
        />
        <StatCard
          label="Closes"
          value={totals.closes}
          icon={<Gauge className="h-4 w-4 text-text-muted" aria-hidden="true" />}
        />
        <StatCard
          label="Gross vs net"
          value={usd.format(totals.net)}
          sublabel={`of ${usd.format(totals.gross)} at list`}
          icon={<BadgeDollarSign className="h-4 w-4 text-text-muted" aria-hidden="true" />}
          accent={totals.net < totals.gross}
        />
        <StatCard
          label="Discounted closes"
          value={totals.discounted}
          sublabel={`${usd.format(totals.gross - totals.net)} total discount given`}
          icon={<Clock3 className="h-4 w-4 text-text-muted" aria-hidden="true" />}
        />
      </div>

      {reps.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No reps provisioned yet"
          description="Rep accounts are provisioned manually (CLAUDE.md, Rep Provisioning). Metrics appear the moment the first rep is on the roster."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reps.map((rep) => (
            <RepCard key={rep.repId} rep={rep} onOpenDeals={setOpenRep} />
          ))}
        </div>
      )}

      {/* Per-deal drill-down (spec §4D: SlideOverDetailPanel primitive). */}
      <SlideOverDetailPanel
        open={openRep !== null}
        onClose={() => setOpenRep(null)}
        title={openRep ? openRep.name : ''}
        subtitle={openRep ? `${openRep.closedCount} closed · net ${usd.format(openRep.netRevenue)}` : undefined}
      >
        {openRep && (
          <ul className="space-y-4">
            {openRep.deals.map((deal) => (
              <li key={deal.dealId} className="rounded-md border border-mist p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{deal.prospectName}</p>
                    {deal.practiceName && (
                      <p className="truncate text-xs text-text-muted">{deal.practiceName}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'font-heading text-sm font-bold',
                        !deal.priceConfirmed
                          ? 'text-warning'
                          : deal.discounted
                            ? 'text-accent'
                            : 'text-text',
                      )}
                    >
                      {usd.format(deal.price)}
                    </p>
                    {/* An assumed list price (no deal row / NULL territory_price)
                        must read as unconfirmed, not as a real close. */}
                    {!deal.priceConfirmed && (
                      <span
                        className="mt-0.5 inline-flex items-center gap-1 text-[0.625rem] font-medium uppercase tracking-caps text-warning"
                        title="No price on record — this is the $179,000 list-price assumption, not a confirmed figure."
                      >
                        <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                        Assumed
                      </span>
                    )}
                  </div>
                </div>
                <dl className="mt-2 space-y-1 text-xs text-text-muted">
                  {deal.territoryName && (
                    <div className="flex justify-between">
                      <dt>Territory</dt>
                      <dd className="text-text">{deal.territoryName}</dd>
                    </div>
                  )}
                  {deal.discounted && (
                    <div className="flex justify-between">
                      <dt>Discount reason</dt>
                      <dd className="text-text">
                        {deal.discountReason ? DISCOUNT_REASON_LABELS[deal.discountReason] : '—'}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt>Deal cycle</dt>
                    <dd className="text-text">{deal.cycleDays !== null ? `${deal.cycleDays}d` : '—'}</dd>
                  </div>
                  {deal.addressable !== null && (
                    <div className="flex justify-between">
                      <dt>Addressable market</dt>
                      <dd className="text-text">{deal.addressable.toLocaleString('en-US')}</dd>
                    </div>
                  )}
                  {deal.pricePerAddressable !== null && (
                    <div className="flex justify-between">
                      <dt>$/addressable</dt>
                      <dd className="text-text">${deal.pricePerAddressable.toFixed(2)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt>Closed</dt>
                    <dd className="text-text">
                      {new Date(deal.closedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </SlideOverDetailPanel>
    </div>
  )
}
