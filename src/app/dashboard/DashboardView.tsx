import Link from 'next/link'
import { Flame } from 'lucide-react'
import { cn } from '@/design/cn'
import EmptyState from '@/components/ui/EmptyState'
import type { DashboardData, StageCount } from '@/lib/dashboard/data'
import type { FeedItem, FeedPriority, HotLead } from '@/lib/dashboard/triggers'

const PRIORITY_STYLE: Record<FeedPriority, string> = {
  High: 'bg-accent text-black',
  Med: 'bg-primary/10 text-primary',
  Low: 'bg-mist text-text-muted',
}

function PriorityChip({ priority }: { priority: FeedPriority }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5',
        'font-heading text-[0.625rem] uppercase tracking-caps',
        PRIORITY_STYLE[priority],
      )}
    >
      {priority}
    </span>
  )
}

function StageStrip({ stages }: { stages: StageCount[] }) {
  return (
    <section>
      <h2 className="mb-2 font-heading text-xs uppercase tracking-caps text-text-muted">Pipeline</h2>
      {/* Horizontal scroll on mobile — never wrap the 11 cells at 390px. */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {stages.map((s) => (
          <div
            key={s.id}
            className="flex min-w-[92px] shrink-0 flex-col rounded-lg border border-mist bg-bg px-3 py-2"
          >
            <span className="font-heading text-2xl font-bold text-text">{s.count}</span>
            <span className="mt-0.5 text-[0.6875rem] leading-tight text-text-muted">
              {s.id}. {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function FeedRow({ item }: { item: FeedItem }) {
  return (
    <li>
      <Link
        href={`/prospects/${item.prospectId}`}
        className="flex items-start gap-3 rounded-lg border border-mist bg-bg px-3 py-2.5 transition-colors hover:border-primary"
      >
        <PriorityChip priority={item.priority} />
        <span className="min-w-0">
          <span className="font-heading text-[0.625rem] uppercase tracking-caps text-text-muted">
            {item.category}
          </span>
          <span className="block text-sm text-text">
            <span className="font-semibold">{item.who}</span> {item.action}
          </span>
        </span>
      </Link>
    </li>
  )
}

function HotLeadRow({ lead }: { lead: HotLead }) {
  return (
    <li>
      <Link
        href={`/prospects/${lead.prospectId}`}
        className="flex items-start gap-2 rounded-lg border border-mist bg-bg px-3 py-2.5 transition-colors hover:border-accent"
      >
        <Flame className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-text">{lead.who}</span>
          <span className="block text-xs text-text-muted">{lead.action}</span>
        </span>
      </Link>
    </li>
  )
}

export default function DashboardView({ data }: { data: DashboardData }) {
  const { stageCounts, totalActive, feed, hotLeads } = data
  return (
    <main className="mx-auto max-w-[1400px] px-6 py-6">
      <header className="border-b border-mist pb-4">
        <h1 className="font-heading text-2xl font-bold text-text">Dashboard</h1>
        <p className="text-sm text-text-muted">
          {totalActive} active {totalActive === 1 ? 'prospect' : 'prospects'} · proposal engagement, live
        </p>
      </header>

      <div className="mt-6 space-y-6">
        <StageStrip stages={stageCounts} />

        <div className="grid grid-cols-1 gap-6 min-[1024px]:grid-cols-[1fr_340px]">
          {/* Engagement feed (spec §8 / §4B Recommended-Actions pattern) */}
          <section>
            <h2 className="mb-2 font-heading text-xs uppercase tracking-caps text-text-muted">
              Recommended actions
            </h2>
            {feed.length === 0 ? (
              <EmptyState
                title="No proposal engagement yet"
                description="Section views, dwell, and CTA clicks surface here as prospects open their proposals."
              />
            ) : (
              <ul className="space-y-2">
                {feed.map((item) => (
                  <FeedRow key={item.prospectId} item={item} />
                ))}
              </ul>
            )}
          </section>

          {/* Hot-lead list — trigger hits, last 7 days (spec §8) */}
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 font-heading text-xs uppercase tracking-caps text-text-muted">
              <Flame className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Hot leads · 7 days
            </h2>
            {hotLeads.length === 0 ? (
              <p className="rounded-lg border border-dashed border-mist bg-bg px-3 py-6 text-center text-sm text-text-muted">
                No trigger hits in the last 7 days.
              </p>
            ) : (
              <ul className="space-y-2">
                {hotLeads.map((lead) => (
                  <HotLeadRow key={lead.prospectId} lead={lead} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
