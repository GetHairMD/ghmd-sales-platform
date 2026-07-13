'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import AddressableVsFloor from '@/components/territory/AddressableVsFloor'
import TerritoryBoundaryMap from '@/components/territory/TerritoryBoundaryMap'
import {
  addressableFloorStatus,
  parseSizingJobResult,
  type ParsedSizingResult,
} from '@/lib/territories/v3-display'

/**
 * Territory Scouting result panel (decision #146). Polls GET
 * /api/territory-scouting/reports/{reportId} while the sizing job is queued/running, then
 * renders the addressable-vs-floor headline + boundary map for a VIABLE result, or a
 * non-viable / failed state otherwise.
 *
 * Composes the SAME display primitives as the exec territory-sizing surface
 * (AddressableVsFloor + TerritoryBoundaryMap) but deliberately does NOT reuse V3SizingPanel:
 * that component POSTs to /api/territories/size* and renders an "Approve this territory"
 * action, neither of which exists in the deal-independent scouting flow. There is no
 * territory-promotion concept in v1.
 */

const POLL_MS = 2500

type Phase = 'loading' | 'sizing' | 'preview' | 'nonviable' | 'failed'

interface Props {
  reportId: string
  /** Practice center for the boundary map marker + framing (from the list row). */
  center: { lat: number; lng: number } | null
  /** Fired once when a poll reaches a terminal state, so the parent list can refresh its chip. */
  onResolved?: () => void
}

function deriveFromJob(
  status: string,
  result: unknown,
): { phase: Phase; parsed: ParsedSizingResult | null } {
  if (status === 'succeeded') {
    const parsed = parseSizingJobResult(result)
    if (parsed && parsed.status === 'VIABLE' && parsed.boundaryFeature) return { phase: 'preview', parsed }
    return { phase: 'nonviable', parsed }
  }
  if (status === 'failed') return { phase: 'failed', parsed: null }
  return { phase: 'sizing', parsed: null } // queued | running
}

export default function ScoutingResultPanel({ reportId, center, onResolved }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [parsed, setParsed] = useState<ParsedSizingResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hold the latest onResolved without making it a poll() dependency (keeps poll stable).
  const onResolvedRef = useRef(onResolved)
  onResolvedRef.current = onResolved

  const clearPoll = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }

  const poll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/territory-scouting/reports/${id}`)
      const data = await res.json()
      if (!res.ok) {
        setPhase('failed')
        setMessage(data.error ?? 'Failed to read scouting report')
        return
      }
      const job = data.job as { status: string; result: unknown; error?: { message?: string } | null } | null
      if (!job) {
        // Report exists but its job row is gone (job delete cascades sizing_job_id → null).
        setPhase('failed')
        setMessage('This scouting run is no longer available.')
        return
      }
      if (job.status === 'succeeded' || job.status === 'failed') {
        const d = deriveFromJob(job.status, job.result)
        setParsed(d.parsed)
        setPhase(d.phase)
        if (job.status === 'failed') setMessage(job.error?.message ?? 'Sizing failed')
        onResolvedRef.current?.() // terminal — let the parent list refresh its chip
        return
      }
      setPhase('sizing')
      pollRef.current = setTimeout(() => poll(id), POLL_MS) // still queued/running
    } catch (err) {
      setPhase('failed')
      setMessage(err instanceof Error ? err.message : 'Network error while polling')
    }
  }, [])

  // Restart the poll whenever the selected report changes.
  useEffect(() => {
    clearPoll()
    setParsed(null)
    setMessage(null)
    setPhase('loading')
    void poll(reportId)
    return clearPoll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  const floor = addressableFloorStatus(parsed?.addressable ?? 0).floor

  return (
    <div className="space-y-4">
      {message && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {message}
        </p>
      )}

      {(phase === 'loading' || phase === 'sizing') && (
        <p className="text-sm text-text-muted">
          {phase === 'loading'
            ? 'Loading result…'
            : 'Sizing in progress — this can take up to a couple of minutes for dense metros.'}
        </p>
      )}

      {phase === 'nonviable' && (
        <div className="rounded-md border border-error/40 bg-error/5 p-4">
          <p className="font-heading text-sm font-semibold text-error">Not viable</p>
          <p className="mt-1 text-sm text-text-muted">
            Even at the maximum drive-time this location does not reach the{' '}
            {floor.toLocaleString()} addressable floor
            {parsed ? ` (best achieved: ${Math.round(parsed.addressable).toLocaleString()})` : ''}. This
            location would not stand alone as a territory.
          </p>
        </div>
      )}

      {phase === 'preview' && parsed?.boundaryFeature && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AddressableVsFloor addressable={parsed.addressable} />
          <TerritoryBoundaryMap feature={parsed.boundaryFeature} center={center} height={220} />
        </div>
      )}
    </div>
  )
}
