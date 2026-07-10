import Link from 'next/link'
import { Flame, Users, FileText, Trophy } from 'lucide-react'
import { cn } from '@/design/cn'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import EmptyState from '@/components/ui/EmptyState'
import GreetingHeader from '@/components/shell/GreetingHeader'
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

/** Card header — all-caps tracked label with optional trailing node (spec §9 label style). */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 font-heading text-xs uppercase tracking-caps text-text-muted">
      {children}
    </h2>
  )
}

function FeedRow({ item }: { item: FeedItem }) {
  return (
    <li>
      <Link
        href={`/prospects/${item.prospectId}`}
        className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-bg-subtle"
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
        className="flex items-start gap-2 px-4 py-3 transition-colors hover:bg-bg-subtle"
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

function StageStrip({ stages }: { stages: StageCount[] }) {
  return (
    <section>
      <SectionLabel>Pipeline by stage</SectionLabel>
      {/* Horizontal scroll on mobile — never wrap the stage cells at 390px. */}
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
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

export default function DashboardView({ data }: { data: DashboardData }) {
  const { stageCounts, totalActive, activeProposals, wonCount, feed, hotLeads } = data
  const wonPct = totalActive > 0 ? Math.round((wonCount / totalActive) * 100) : 0

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <GreetingHeader subtitle="Here's what's moving in your pipeline today." />

      {/* KPI grid — NIP stat-card pattern. Deltas intentionally omitted until a
          period-over-period baseline exists; no fabricated month-over-month numbers. */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active prospects"
          value={totalActive}
          sublabel={`Across ${stageCounts.length} pipeline stages`}
          icon={<Users className="h-4 w-4 text-text-muted" aria-hidden="true" />}
        />
        <StatCard
          label="Active proposals"
          value={activeProposals}
          sublabel="Live proposal pages"
          icon={<FileText className="h-4 w-4 text-text-muted" aria-hidden="true" />}
        />
        <StatCard
          label="Hot leads · 7d"
          value={hotLeads.length}
          sublabel="Trigger hits, last 7 days"
          accent
          icon={<Flame className="h-4 w-4 text-accent" aria-hidden="true" />}
        />
        <StatCard
          label="Won"
          value={wonCount}
          sublabel={`${wonPct}% of active pipeline`}
          icon={<Trophy className="h-4 w-4 text-text-muted" aria-hidden="true" />}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 min-[1024px]:grid-cols-[1fr_340px]">
        {/* Engagement feed (spec §8 / §4B Recommended-Actions pattern) */}
        <section>
          <SectionLabel>Recommended actions</SectionLabel>
          <Card padding="none" className="mt-2 overflow-hidden">
            {feed.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No proposal engagement yet"
                  description="Section views, dwell, and CTA clicks surface here as prospects open their proposals."
                />
              </div>
            ) : (
              <ul className="divide-y divide-mist">
                {feed.map((item) => (
                  <FeedRow key={item.prospectId} item={item} />
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* Hot-lead list — trigger hits, last 7 days (spec §8) */}
        <section>
          <SectionLabel>
            <Flame className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Hot leads · 7 days
          </SectionLabel>
          <Card padding="none" className="mt-2 overflow-hidden">
            {hotLeads.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-text-muted">
                No trigger hits in the last 7 days.
              </p>
            ) : (
              <ul className="divide-y divide-mist">
                {hotLeads.map((lead) => (
                  <HotLeadRow key={lead.prospectId} lead={lead} />
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <div className="mt-6">
        <StageStrip stages={stageCounts} />
      </div>
    </main>
  )
}
