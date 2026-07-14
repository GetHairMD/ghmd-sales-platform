'use client'

import { useMemo, useState } from 'react'
import { Trophy, Medal, Flame, ChevronUp, ChevronDown, FileText, Target } from 'lucide-react'
import { cn } from '@/design/cn'
import Card from '@/components/ui/Card'
import SlideOverDetailPanel from '@/components/ui/SlideOverDetailPanel'
import {
  type ScoreboardRow,
  type ScoreboardSortKey,
  sortRows,
  formatCurrency,
  formatCurrencyCompact,
} from '@/lib/scoreboard/scoreboard'

/**
 * Scoreboard leaderboard (E-1) — top-3 rank cards + a sortable table, tokens only
 * (Hard Rule 8). Rows arrive PRE-RANKED from the server (rankRows). Every figure is
 * aggregate: deals closed, pipeline value, proposal engagement, streak. The rep
 * click-through opens a SlideOverDetailPanel showing THAT rep's own aggregate detail
 * — never any individual prospect list, never another rep's data (the row model
 * carries nothing else). This component never fetches; it only sorts and renders.
 */

/** A leaderboard row plus its fixed rank (leaderboard position, independent of table sort). */
interface RankedRow extends ScoreboardRow {
  rank: number
}

interface Column {
  key: ScoreboardSortKey
  label: string
  numeric: boolean
  format?: (row: RankedRow) => string
}

const COLUMNS: Column[] = [
  { key: 'repName', label: 'Rep', numeric: false },
  { key: 'dealsClosed', label: 'Deals closed', numeric: true, format: (r) => String(r.dealsClosed) },
  { key: 'pipelineValue', label: 'Pipeline value', numeric: true, format: (r) => formatCurrency(r.pipelineValue) },
  { key: 'proposalEngagement', label: 'Engagement', numeric: true, format: (r) => String(r.proposalEngagement) },
  { key: 'currentStreak', label: 'Streak', numeric: true, format: (r) => streakLabel(r.currentStreak) },
]

function streakLabel(months: number): string {
  if (months <= 0) return '—'
  return `${months} mo`
}

/** Medallion tint for the top three; tokens only (accent / primary / secondary). */
const RANK_STYLE: Record<number, string> = {
  1: 'bg-accent text-text-inverse',
  2: 'bg-primary text-text-inverse',
  3: 'bg-secondary text-text',
}

function RankMedallion({ rank, className }: { rank: number; className?: string }) {
  const Icon = rank === 1 ? Trophy : Medal
  return (
    <span
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold',
        RANK_STYLE[rank] ?? 'bg-mist text-text-muted',
        className,
      )}
    >
      {rank <= 3 ? <Icon className="h-5 w-5" aria-hidden="true" /> : rank}
    </span>
  )
}

function RankCard({ row }: { row: RankedRow }) {
  return (
    <Card padding="md" className={cn('flex flex-col gap-3', row.rank === 1 && 'border-t-2 border-t-accent')}>
      <div className="flex items-center gap-3">
        <RankMedallion rank={row.rank} />
        <div className="min-w-0">
          <div className="truncate font-heading text-base font-bold text-text">{row.repName}</div>
          <div className="text-xs uppercase tracking-caps text-text-muted">Rank #{row.rank}</div>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="font-heading text-3xl font-bold leading-none text-text">{row.dealsClosed}</div>
          <div className="mt-1 text-xs text-text-muted">deals closed</div>
        </div>
        <div className="text-right">
          <div className="font-heading text-lg font-bold leading-none text-primary">
            {formatCurrencyCompact(row.pipelineValue)}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 text-xs text-text-muted">
            {row.currentStreak > 0 && <Flame className="h-3.5 w-3.5 text-accent" aria-hidden="true" />}
            {streakLabel(row.currentStreak)} streak
          </div>
        </div>
      </div>
    </Card>
  )
}

function SortHeader({
  column,
  active,
  direction,
  onSort,
}: {
  column: Column
  active: boolean
  direction: 'asc' | 'desc'
  onSort: (key: ScoreboardSortKey) => void
}) {
  const Arrow = direction === 'asc' ? ChevronUp : ChevronDown
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(
        'px-4 py-3 font-heading text-xs uppercase tracking-caps text-text-muted',
        column.numeric ? 'text-right' : 'text-left',
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-text focus:outline-none focus-visible:text-text',
          column.numeric && 'flex-row-reverse',
          active && 'text-text',
        )}
      >
        {column.label}
        {active && <Arrow className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </th>
  )
}

export default function Scoreboard({ rows }: { rows: ScoreboardRow[] }) {
  // Rows come pre-ranked; freeze each row's leaderboard rank so it survives re-sorts.
  const rankedRows = useMemo<RankedRow[]>(
    () => rows.map((r, i) => ({ ...r, rank: i + 1 })),
    [rows],
  )

  const [sortKey, setSortKey] = useState<ScoreboardSortKey>('dealsClosed')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<RankedRow | null>(null)

  const sorted = useMemo(
    () => sortRows(rankedRows, sortKey, sortDir) as RankedRow[],
    [rankedRows, sortKey, sortDir],
  )

  const onSort = (key: ScoreboardSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      // Text sorts default ascending; numeric columns default to highest-first.
      setSortDir(key === 'repName' ? 'asc' : 'desc')
    }
  }

  const topThree = rankedRows.slice(0, 3)

  return (
    <div className="space-y-8">
      {/* Top-3 rank cards */}
      <section aria-label="Top performers">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topThree.map((row) => (
            <RankCard key={row.repId} row={row} />
          ))}
        </div>
      </section>

      {/* Full sortable table */}
      <section aria-label="Full leaderboard">
        <div className="overflow-x-auto rounded-lg border border-mist">
          <table className="w-full min-w-[36rem] border-collapse">
            <thead className="border-b border-mist bg-bg-subtle">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-heading text-xs uppercase tracking-caps text-text-muted">
                  Rank
                </th>
                {COLUMNS.map((c) => (
                  <SortHeader
                    key={c.key}
                    column={c}
                    active={sortKey === c.key}
                    direction={sortDir}
                    onSort={onSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.repId}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer border-b border-mist last:border-0 transition-colors hover:bg-bg-subtle"
                >
                  <td className="px-4 py-3">
                    <RankMedallion rank={row.rank} className="h-7 w-7 text-xs" />
                  </td>
                  <td className="px-4 py-3 font-medium text-text">{row.repName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text">{row.dealsClosed}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text">{formatCurrency(row.pipelineValue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text">{row.proposalEngagement}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-muted">{streakLabel(row.currentStreak)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Rep click-through — that rep's OWN aggregate detail only. */}
      <SlideOverDetailPanel
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.repName ?? ''}
        subtitle={selected ? `Rank #${selected.rank}` : undefined}
      >
        {selected && <RepDetail row={selected} />}
      </SlideOverDetailPanel>
    </div>
  )
}

/** The clicked rep's aggregate detail. No individual prospect data exists on the row. */
function RepDetail({ row }: { row: RankedRow }) {
  const items = [
    { label: 'Deals closed', value: String(row.dealsClosed), icon: Trophy },
    { label: 'Pipeline value', value: formatCurrency(row.pipelineValue), icon: Target },
    { label: 'Proposal engagement', value: String(row.proposalEngagement), icon: FileText },
    { label: 'Current streak', value: streakLabel(row.currentStreak), icon: Flame },
  ]
  return (
    <dl className="space-y-5">
      {items.map((it) => {
        const Icon = it.icon
        return (
          <div key={it.label} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-subtle">
              <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
            </span>
            <div>
              <dt className="font-heading text-xs uppercase tracking-caps text-text-muted">{it.label}</dt>
              <dd className="mt-0.5 font-heading text-2xl font-bold leading-none text-text">{it.value}</dd>
            </div>
          </div>
        )
      })}
      <p className="pt-2 text-xs leading-snug text-text-muted">
        Aggregate figures only. Individual deal and territory detail is not shown here.
      </p>
    </dl>
  )
}
