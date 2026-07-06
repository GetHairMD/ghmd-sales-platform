import type { ReactNode } from 'react'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/design/cn'
import Card from './Card'

export interface StatCardProps {
  /** All-caps tracked label (NIP KPI card pattern). */
  label: string
  /** Primary figure — pre-formatted by the caller (e.g. "12", "84%"). */
  value: ReactNode
  /** Optional one-line context under the value (e.g. "Trigger hits, last 7 days"). */
  sublabel?: ReactNode
  /** Optional leading icon, tinted by the caller. */
  icon?: ReactNode
  /** Emphasize with an accent top border (e.g. the hot-leads card). */
  accent?: boolean
}

/**
 * KPI stat card (spec §4B). NIP dashboard pattern: all-caps label, large figure,
 * optional context line. Deltas are a separate concern — see StatCardDelta.
 */
export default function StatCard({ label, value, sublabel, icon, accent = false }: StatCardProps) {
  return (
    <Card
      padding="md"
      className={cn('flex flex-col gap-2', accent && 'border-t-2 border-t-accent')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-[0.6875rem] uppercase tracking-caps text-text-muted">
          {label}
        </span>
        {icon}
      </div>
      <span className="font-heading text-3xl font-bold leading-none text-text">{value}</span>
      {sublabel && <span className="text-xs leading-snug text-text-muted">{sublabel}</span>}
    </Card>
  )
}

export type DeltaDirection = 'up' | 'down' | 'flat'

export interface StatCardDeltaProps extends Omit<StatCardProps, 'sublabel'> {
  /**
   * Period-over-period change (NIP ↑/↓ pattern). OPTIONAL and never fabricated —
   * omit it when there is no real prior-period baseline and the card renders as a
   * plain StatCard. `positiveIsGood` flips the color semantics (e.g. for churn).
   */
  delta?: {
    direction: DeltaDirection
    /** Pre-formatted magnitude, e.g. "+3" or "12%". */
    label: string
    /** Period descriptor shown in muted text, e.g. "vs last month". */
    period?: string
  }
  /** When true (default), an "up" delta is green and "down" is red. */
  positiveIsGood?: boolean
}

/**
 * StatCard with an optional period delta (spec §4B: "period deltas ↑/↓ vs last
 * month, NIP pattern"). If `delta` is undefined it degrades to a clean StatCard —
 * we show a delta only when the number is real.
 */
export function StatCardDelta({
  delta,
  positiveIsGood = true,
  ...card
}: StatCardDeltaProps) {
  if (!delta) return <StatCard {...card} />

  const good = delta.direction === 'up' ? positiveIsGood : !positiveIsGood
  const tone =
    delta.direction === 'flat'
      ? 'text-text-muted'
      : good
        ? 'text-success'
        : 'text-error'
  const Icon = delta.direction === 'down' ? ArrowDownRight : ArrowUpRight

  return (
    <StatCard
      {...card}
      sublabel={
        <span className="flex items-center gap-1">
          <span className={cn('inline-flex items-center gap-0.5 font-medium', tone)}>
            {delta.direction !== 'flat' && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            {delta.label}
          </span>
          {delta.period && <span className="text-text-muted">{delta.period}</span>}
        </span>
      }
    />
  )
}
