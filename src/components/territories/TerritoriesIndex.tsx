'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, MapPin } from 'lucide-react'
import { cn } from '@/design/cn'

/**
 * Deal Territories index (E-0b) — searchable-by-state list. Rows arrive already
 * ROLE-SHAPED by the server page: RLS decides which rows exist, and the server
 * marks each row `full` (viewer entitled to detail) or `minimal` (another rep's
 * sold territory — practice / closing rep / date only, no addressable/census, no
 * detail link). This component never fetches; it only searches, groups, and renders.
 */

export interface TerritoryRow {
  id: string
  name: string
  /** USPS 2-letter code, or null (e.g. a QA anchor / lookup miss). */
  state: string | null
  status: string
  /** `full` = viewer may see detail; `minimal` = other rep's sold row (redacted server-side). */
  detail: 'full' | 'minimal'
  /** Present only on `full` rows. Null on minimal rows by construction. */
  addressable: number | null
  soldTo: string | null
  closedBy: string | null
  soldAt: string | null
  /** Detail-page link; null when the row is not openable by this viewer. */
  href: string | null
}

const STATUS_STYLE: Record<string, string> = {
  available: 'bg-success/10 text-success',
  reserved: 'bg-warning/10 text-warning',
  sold: 'bg-primary/10 text-primary',
  draft: 'bg-mist text-text-muted',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        STATUS_STYLE[status] ?? 'bg-mist text-text-muted',
      )}
    >
      {status}
    </span>
  )
}

/** Group label for a state code; NULL sorts last under a generic bucket. */
const NO_STATE = 'Unlocated'

function formatSoldAt(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString()
}

function SoldLine({ row }: { row: TerritoryRow }) {
  const parts = [
    row.soldTo ? `Sold to ${row.soldTo}` : null,
    row.closedBy ? `Closed by ${row.closedBy}` : null,
    formatSoldAt(row.soldAt),
  ].filter(Boolean)
  if (parts.length === 0) return <span className="text-xs text-text-muted">Sold</span>
  return <span className="text-xs text-text-muted">{parts.join(' · ')}</span>
}

/** Detail cell: addressable for full rows; the minimal sold summary otherwise. */
function DetailCell({ row }: { row: TerritoryRow }) {
  if (row.status === 'sold') return <SoldLine row={row} />
  if (row.detail === 'minimal') return <span className="text-xs text-text-muted">—</span>
  if (row.addressable != null) {
    return (
      <span className="text-sm text-text">
        <span className="font-semibold text-primary">{row.addressable.toLocaleString()}</span>
        <span className="ml-1 text-xs text-text-muted">addressable</span>
      </span>
    )
  }
  return <span className="text-xs text-text-muted">Census pending</span>
}

function TerritoryRowItem({ row }: { row: TerritoryRow }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 truncate font-medium text-text">{row.name}</span>
      <DetailCell row={row} />
      <StatusBadge status={row.status} />
    </>
  )
  const shared = 'flex items-center gap-3 rounded-lg border border-mist px-4 py-3'
  if (row.href) {
    return (
      <Link href={row.href} className={cn(shared, 'bg-bg transition-colors hover:border-primary hover:shadow-sm')}>
        {inner}
      </Link>
    )
  }
  // Minimal rows (another rep's sold territory) are intentionally non-interactive — the
  // detail page would be RLS-filtered to a 404 for this viewer anyway.
  return <div className={cn(shared, 'bg-bg-subtle')}>{inner}</div>
}

export default function TerritoriesIndex({ rows }: { rows: TerritoryRow[] }) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? rows.filter((r) =>
          [r.name, r.state, r.soldTo, r.closedBy, r.status]
            .filter((v): v is string => Boolean(v))
            .some((v) => v.toLowerCase().includes(q)),
        )
      : rows

    const byState = new Map<string, TerritoryRow[]>()
    for (const r of filtered) {
      const key = r.state ?? NO_STATE
      const bucket = byState.get(key)
      if (bucket) bucket.push(r)
      else byState.set(key, [r])
    }

    // Real state codes A→Z; the NO_STATE bucket always sorts last.
    return Array.from(byState.entries())
      .sort(([a], [b]) => {
        if (a === NO_STATE) return 1
        if (b === NO_STATE) return -1
        return a.localeCompare(b)
      })
      .map(([state, items]) => ({
        state,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }, [query, rows])

  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-lg border border-mist px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by state, territory, or practice…"
          aria-label="Search territories"
          className="w-full bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
        />
        <span className="shrink-0 text-xs text-text-muted">{total}</span>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-mist p-12 text-center">
          <p className="text-sm text-text-muted">No territories match &ldquo;{query}&rdquo;.</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.state}>
            <h2 className="mb-2 flex items-center gap-1.5 font-heading text-xs uppercase tracking-caps text-text-muted">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {group.state === NO_STATE ? NO_STATE : group.state}
              <span className="text-text-muted/60">· {group.items.length}</span>
            </h2>
            <div className="space-y-2">
              {group.items.map((row) => (
                <TerritoryRowItem key={row.id} row={row} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
