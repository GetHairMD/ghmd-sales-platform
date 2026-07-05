'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/design/cn'
import type { DemandMatrix } from '@/lib/proposal/types'

interface DemandTableProps {
  matrix: DemandMatrix
  /** Presentational male/female share; derived from cohorts when absent. */
  malePct: number | null
  femalePct: number | null
}

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** A single summary metric card (mobile). */
function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-mist bg-bg p-3">
      <div className="font-heading text-xs uppercase tracking-caps text-text-muted">{label}</div>
      <div className="mt-1 font-heading text-xl font-bold text-text">{value}</div>
    </div>
  )
}

/**
 * Section 4 — TERRITORY DEMOGRAPHICS (decision #68). Age × sex population
 * composition from ACS B01001. This is demographic context only, kept
 * analytically separate from the addressable-market figures. Plain population
 * counts — no interpretive language layered on top.
 *
 * Mobile-first: at < sm the wide table is hidden behind summary cards + a
 * "View full table" toggle so it never breaks the layout at 390px.
 */
export default function DemandTable({ matrix, malePct, femalePct }: DemandTableProps) {
  const [showTable, setShowTable] = useState(false)

  const stats = useMemo(() => {
    const cohorts = matrix.cohorts ?? []
    const male = cohorts.reduce((sum, c) => sum + (c.male || 0), 0)
    const female = cohorts.reduce((sum, c) => sum + (c.female || 0), 0)
    const total = male + female
    const peak = cohorts.reduce<{ band: string; count: number }>(
      (best, c) => {
        const count = (c.male || 0) + (c.female || 0)
        return count > best.count ? { band: c.ageBand, count } : best
      },
      { band: '—', count: -1 },
    )
    // Prefer supplied shares; fall back to cohort-derived split.
    const mShare = malePct ?? (total > 0 ? (male / total) * 100 : null)
    const fShare = femalePct ?? (total > 0 ? (female / total) * 100 : null)
    return { male, female, total, peakBand: peak.count >= 0 ? peak.band : '—', mShare, fShare }
  }, [matrix.cohorts, malePct, femalePct])

  const source = matrix.source?.trim() || 'U.S. Census ACS (B01001)'

  return (
    <div>
      <h3 className="font-heading text-xl font-bold text-text">Population by Age &amp; Sex</h3>
      <p className="mt-1 font-serif text-sm text-text-muted">
        Territory demographic composition — {source}.
      </p>

      {/* Male / Female share — plain population split, plainly labelled */}
      {(stats.mShare != null || stats.fShare != null) && (
        <p className="mt-2 text-sm text-text-muted">
          Male / Female share:{' '}
          <span className="font-heading text-text">
            {stats.mShare != null ? `${stats.mShare.toFixed(1)}%` : '—'}
          </span>{' '}
          /{' '}
          <span className="font-heading text-text">
            {stats.fShare != null ? `${stats.fShare.toFixed(1)}%` : '—'}
          </span>
        </p>
      )}

      {/* Mobile: summary cards + toggle. Never renders the wide table by default. */}
      <div className="mt-4 sm:hidden">
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard label="Total population" value={int.format(stats.total)} />
          <SummaryCard label="Peak band" value={stats.peakBand} />
          <SummaryCard label="Male" value={int.format(stats.male)} />
          <SummaryCard label="Female" value={int.format(stats.female)} />
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="mt-3 font-heading text-xs uppercase tracking-caps text-primary"
          aria-expanded={showTable}
        >
          {showTable ? 'Hide full table' : 'View full table'}
        </button>
        {showTable && (
          <div className="mt-3 overflow-x-auto">
            <DemandRows matrix={matrix} totals={stats} />
          </div>
        )}
      </div>

      {/* Desktop: full table, wrapped so it never breaks the page horizontally. */}
      <div className="mt-4 hidden overflow-x-auto sm:block">
        <DemandRows matrix={matrix} totals={stats} />
      </div>
    </div>
  )
}

/** The full age-band table body — shared between the desktop view and the
 *  mobile toggle so the markup stays identical. */
function DemandRows({
  matrix,
  totals,
}: {
  matrix: DemandMatrix
  totals: { male: number; female: number; total: number }
}) {
  return (
    <table className="w-full min-w-[24rem] border-collapse text-sm">
      <thead>
        <tr className="border-b border-mist text-left font-heading text-xs uppercase tracking-caps text-text-muted">
          <th className="py-2 pr-4">Age band</th>
          <th className="py-2 pr-4 text-right">Male</th>
          <th className="py-2 pr-4 text-right">Female</th>
          <th className="py-2 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {matrix.cohorts.map((c) => (
          <tr key={c.ageBand} className="even:bg-bg-subtle">
            <td className="py-2 pr-4 text-text">{c.ageBand}</td>
            <td className="py-2 pr-4 text-right text-text">{int.format(c.male || 0)}</td>
            <td className="py-2 pr-4 text-right text-text">{int.format(c.female || 0)}</td>
            <td className="py-2 text-right font-heading text-text">
              {int.format((c.male || 0) + (c.female || 0))}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className={cn('border-t border-mist font-heading text-text')}>
          <td className="py-2 pr-4">Total</td>
          <td className="py-2 pr-4 text-right">{int.format(totals.male)}</td>
          <td className="py-2 pr-4 text-right">{int.format(totals.female)}</td>
          <td className="py-2 text-right">{int.format(totals.total)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
