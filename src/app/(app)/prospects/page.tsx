import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { DEAL_STATUSES, type DealStatus } from '@/lib/pipeline-stages'
import { groupProspectsByDealStatus } from '@/lib/group-by-deal-status'
import Card from '@/components/ui/Card'
import HealthChip from '@/components/ui/HealthChip'
import StagePill from '@/components/ui/StagePill'
import EmptyState from '@/components/ui/EmptyState'

/**
 * Prospects list (redesign, 2026-07-11). Grouped by deal HEALTH (active / stalled / lost) —
 * deliberately distinct from Pipeline (stage-grouped) and Dashboard (engagement-surfaced),
 * so stalled/lost deals neither of those foregrounds get a home here. Excludes archived rows
 * and paginates explicitly (no silent 50-row cliff). Tokenized onto the design system.
 */

const PAGE_SIZE = 100
const SECTION_LABELS: Record<DealStatus, string> = {
  active: 'Active',
  stalled: 'Stalled',
  lost: 'Lost',
}

type ProspectRow = {
  id: string
  full_name: string
  practice_name: string | null
  stage: number
  deal_status: string | null
  updated_at: string | null
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 font-heading text-xs uppercase tracking-caps text-text-muted">
      {children}
    </h2>
  )
}

function ProspectListRow({ p }: { p: ProspectRow }) {
  return (
    <li>
      <Link
        href={`/prospects/${p.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-subtle"
      >
        <StagePill stage={p.stage} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-text">{p.full_name}</span>
          <span className="block truncate text-xs text-text-muted">
            {p.practice_name || 'No practice on file'}
          </span>
        </span>
        {p.updated_at && (
          <span className="hidden shrink-0 text-xs text-text-muted sm:block">
            {new Date(p.updated_at).toLocaleDateString()}
          </span>
        )}
      </Link>
    </li>
  )
}

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams?: { show?: string }
}) {
  const requested = Number(searchParams?.show)
  const show = Math.min(Math.max(Number.isFinite(requested) ? requested : PAGE_SIZE, PAGE_SIZE), 1000)

  const supabase = createClient()
  const { data, error } = await supabase
    .from('prospects')
    .select('id, full_name, practice_name, stage, deal_status, updated_at')
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(show + 1) // fetch one extra to detect whether more rows exist

  const rows = (data ?? []) as ProspectRow[]
  const hasMore = rows.length > show
  const visible = hasMore ? rows.slice(0, show) : rows
  const grouped = groupProspectsByDealStatus(visible)
  const total = visible.length

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-text">Prospects</h1>
        <Link
          href="/prospects/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-heading text-sm font-medium uppercase tracking-caps text-text-inverse transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Prospect
        </Link>
      </div>

      {error && <p className="text-sm text-error">Error: {error.message}</p>}

      {!error && total === 0 && (
        <Card>
          <EmptyState title="No prospects yet" description="Add your first one to get started." />
        </Card>
      )}

      {!error && total > 0 && (
        <div className="space-y-6">
          {DEAL_STATUSES.map((status) => {
            const group = grouped[status]
            if (group.length === 0) return null
            return (
              <section key={status}>
                <div className="mb-2 flex items-center gap-2">
                  <SectionLabel>{SECTION_LABELS[status]}</SectionLabel>
                  <HealthChip status={status} />
                  <span className="text-xs text-text-muted">{group.length}</span>
                </div>
                <Card padding="none" className="overflow-hidden">
                  <ul className="divide-y divide-mist">
                    {group.map((p) => (
                      <ProspectListRow key={p.id} p={p} />
                    ))}
                  </ul>
                </Card>
              </section>
            )
          })}

          {hasMore && (
            <div className="pt-2 text-center">
              <Link
                href={`/prospects?show=${show + PAGE_SIZE}`}
                className="inline-flex items-center rounded-md border border-mist px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg-subtle"
              >
                Show more
              </Link>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
