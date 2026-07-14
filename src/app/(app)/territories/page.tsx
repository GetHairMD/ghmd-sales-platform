import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getViewerDesignation } from '@/lib/auth/internal-role'
import TerritoriesIndex, { type TerritoryRow } from '@/components/territories/TerritoriesIndex'

/** One row of the territory_sold_summary() RPC — mirrors the SQL RETURNS TABLE shape. */
interface SoldSummaryRow {
  id: string
  name: string
  state: string | null
  sold_at: string | null
  sold_to_practice: string | null
  closed_by_name: string | null
}

/**
 * Deal Territories index (E-0b). Row VISIBILITY is enforced by RLS on `territories`
 * (exec sees all; a rep sees available/unclaimed rows plus their own, any status —
 * every other rep's in-flight AND sold rows are absent from the base query). COLUMN
 * DETAIL is shaped here: base rows are `full`; other reps' sold territories come only
 * from territory_sold_summary() (a SECURITY DEFINER projection that exposes the buyer
 * practice, closing rep, and date but NO addressable/census), rendered as `minimal`.
 */
export default async function TerritoriesPage() {
  const supabase = createClient()
  const isExec = (await getViewerDesignation()) === 'executive'

  // Base rows — RLS-filtered to what the viewer is entitled to see in full.
  const { data: baseRows } = await supabase
    .from('territories')
    .select('id, name, state, status, prospect_id, addressable_patients_primary, sold_at')
    .order('name', { ascending: true })

  // Minimal sold projection — every sold territory, no addressable/census. Used to
  // (a) resolve buyer/closer display names the viewer may not read directly, and
  // (b) add minimal-only rows for other reps' sold territories absent from baseRows.
  const { data: soldData } = await supabase.rpc('territory_sold_summary')
  const soldSummaries = (soldData ?? []) as SoldSummaryRow[]
  const summaryById = new Map(soldSummaries.map((s) => [s.id, s]))
  const baseIds = new Set((baseRows ?? []).map((r) => r.id))

  const rows: TerritoryRow[] = []

  for (const r of baseRows ?? []) {
    const summary = summaryById.get(r.id)
    rows.push({
      id: r.id,
      name: r.name,
      state: r.state ?? null,
      status: r.status ?? 'available',
      detail: 'full',
      addressable: r.addressable_patients_primary ?? null,
      soldTo: summary?.sold_to_practice ?? null,
      closedBy: summary?.closed_by_name ?? null,
      soldAt: r.sold_at ?? summary?.sold_at ?? null,
      href: `/territories/${r.id}`,
    })
  }

  // Other reps' sold territories: present in the summary projection but never in the
  // RLS-filtered base query. Minimal by construction — no addressable, no detail link.
  for (const s of soldSummaries) {
    if (baseIds.has(s.id)) continue
    rows.push({
      id: s.id,
      name: s.name,
      state: s.state ?? null,
      status: 'sold',
      detail: 'minimal',
      addressable: null,
      soldTo: s.sold_to_practice ?? null,
      closedBy: s.closed_by_name ?? null,
      soldAt: s.sold_at ?? null,
      href: null,
    })
  }

  return (
    <main className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-text">Territories</h1>
        {isExec && (
          <Link
            href="/territories/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-heading text-sm font-medium uppercase tracking-caps text-text-inverse transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Territory
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-mist p-12 text-center">
          <p className="mb-1 text-text-muted">No territories yet</p>
          <p className="text-sm text-text-muted">
            Territories become visible here once they are created and sized.
          </p>
        </div>
      ) : (
        <TerritoriesIndex rows={rows} />
      )}
    </main>
  )
}
