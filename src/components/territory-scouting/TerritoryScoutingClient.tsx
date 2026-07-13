'use client'

import { useCallback, useEffect, useState } from 'react'
import { Compass, MapPin } from 'lucide-react'
import Card from '@/components/ui/Card'
import { cn } from '@/design/cn'
import ScoutingForm from './ScoutingForm'
import ScoutingResultPanel from './ScoutingResultPanel'

/**
 * Territory Scouting client shell (decision #146) — executive-only page body. Owns the list
 * of past scouting reports + the current selection, and composes the location form (create)
 * with the polling result panel (view). Deliberately deal-independent: no promote-to-territory
 * action, never touches /territories.
 */

interface ReportSummary {
  id: string
  label: string | null
  location_label: string | null
  center_lat: number | null
  center_lng: number | null
  sizing_job_id: string | null
  created_at: string
  jobStatus: string | null
  addressable: number | null
  viable: boolean | null
}

function StatusChip({ report }: { report: ReportSummary }) {
  const base = 'rounded-full px-2 py-0.5 text-xs font-medium'
  if (report.jobStatus === 'queued' || report.jobStatus === 'running') {
    return <span className={cn(base, 'bg-mist/60 text-text-muted')}>Sizing…</span>
  }
  if (report.jobStatus === 'failed') {
    return <span className={cn(base, 'bg-error/10 text-error')}>Failed</span>
  }
  if (report.jobStatus === 'succeeded') {
    return report.viable ? (
      <span className={cn(base, 'bg-success/10 text-success')}>
        {report.addressable?.toLocaleString()} addressable
      </span>
    ) : (
      <span className={cn(base, 'bg-error/10 text-error')}>Not viable</span>
    )
  }
  return <span className={cn(base, 'bg-mist/60 text-text-muted')}>—</span>
}

function reportTitle(r: ReportSummary): string {
  return r.label || r.location_label || 'Untitled scouting run'
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function TerritoryScoutingClient() {
  const [reports, setReports] = useState<ReportSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    try {
      const res = await fetch('/api/territory-scouting/reports')
      const data = await res.json()
      if (!res.ok) {
        setListError(data.error ?? 'Failed to load scouting reports')
        return
      }
      setReports((data.reports ?? []) as ReportSummary[])
      setListError(null)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Network error loading reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  const handleCreated = useCallback(
    (reportId: string) => {
      setSelectedId(reportId)
      void loadReports()
    },
    [loadReports],
  )

  const selected = reports.find((r) => r.id === selectedId) ?? null
  const selectedCenter =
    selected && selected.center_lat != null && selected.center_lng != null
      ? { lat: selected.center_lat, lng: selected.center_lng }
      : null

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      {/* Left column: create + list */}
      <div className="space-y-6">
        <Card>
          <ScoutingForm onCreated={handleCreated} />
        </Card>

        <div>
          <h2 className="mb-2 font-heading text-xs uppercase tracking-caps text-text-muted">
            Past scouting runs
          </h2>
          {loading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : listError ? (
            <p className="text-sm text-error">{listError}</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-text-muted">
              No scouting runs yet. Scout a location above to see its addressable market.
            </p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => {
                const active = r.id === selectedId
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-mist hover:border-primary/40 hover:bg-bg-subtle',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-text">
                          {reportTitle(r)}
                        </span>
                        <StatusChip report={r} />
                      </span>
                      {r.location_label && r.location_label !== reportTitle(r) && (
                        <span className="flex items-center gap-1 truncate text-xs text-text-muted">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {r.location_label}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">{formatWhen(r.created_at)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Right column: selected result */}
      <div>
        {selected ? (
          <Card>
            <div className="mb-4">
              <h2 className="font-heading text-lg font-bold text-text">{reportTitle(selected)}</h2>
              {selected.location_label && (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-text-muted">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {selected.location_label}
                </p>
              )}
            </div>
            <ScoutingResultPanel
              key={selected.id}
              reportId={selected.id}
              center={selectedCenter}
              onResolved={loadReports}
            />
          </Card>
        ) : (
          <Card>
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Compass className="h-8 w-8 text-text-muted/50" aria-hidden="true" />
              <p className="text-sm text-text-muted">
                Scout a location, or pick a past run to see its addressable market.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
