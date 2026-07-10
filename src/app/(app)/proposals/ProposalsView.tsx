import Link from 'next/link'
import { FileText, Flame } from 'lucide-react'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import { formatDwell, relativeTime, type ProposalListRow } from '@/lib/proposals/rows'

/** All-caps tracked column header (spec §9 label style, matches DashboardView). */
function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2 font-heading text-[0.625rem] uppercase tracking-caps text-text-muted ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function ProposalRow({ row, nowMs }: { row: ProposalListRow; nowMs: number }) {
  const opened = row.lastSeenAt != null
  return (
    <tr className="transition-colors hover:bg-bg-subtle">
      <td className="px-4 py-3">
        <Link
          href={`/p/${row.slug}`}
          aria-label={`Open ${row.who}'s proposal`}
          className="font-semibold text-text hover:text-primary hover:underline"
        >
          {row.who}
        </Link>
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-text">{row.visits}</td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-text">
        {formatDwell(row.totalDwellMs)}
      </td>
      <td className="px-4 py-3 text-sm text-text-muted">
        {opened ? relativeTime(row.lastSeenAt, nowMs) : 'Never opened'}
      </td>
      <td className="px-4 py-3 text-sm text-text-muted">
        {row.hottestSection ? (
          <span className="inline-flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            {row.hottestSection}
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}

export default function ProposalsView({ rows }: { rows: ProposalListRow[] }) {
  // Single server-render timestamp so every relative label shares one "now".
  const nowMs = Date.now()

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text">Proposals</h1>
        <p className="mt-1 text-sm text-text-muted">
          Every live proposal page with its engagement — visits, dwell, last seen, hottest section.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={FileText}
            title="No proposals yet"
            description="Generate a proposal from a prospect's Deal Room and it will appear here with live engagement stats."
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          {/* Horizontal scroll on mobile — never squash the 5 columns at 390px. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-mist">
                  <Th>Proposal</Th>
                  <Th align="right">Visits</Th>
                  <Th align="right">Total dwell</Th>
                  <Th>Last seen</Th>
                  <Th>Hottest section</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {rows.map((row) => (
                  <ProposalRow key={row.proposalId} row={row} nowMs={nowMs} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  )
}
