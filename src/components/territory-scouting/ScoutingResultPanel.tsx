'use client'

import { useEffect, useRef, useState } from 'react'
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
 * non-viable / failed / stalled state otherwise.
 *
 * Composes the SAME display primitives as the exec territory-sizing surface
 * (AddressableVsFloor + TerritoryBoundaryMap) but deliberately does NOT reuse V3SizingPanel:
 * that component POSTs to /api/territories/size* and renders an "Approve this territory"
 * action, neither of which exists in the deal-independent scouting flow. There is no
 * territory-promotion concept in v1.
 *
 * The poll lives inside the reportId effect with a `cancelled` guard so switching reports
 * (which remounts this panel via a `key`) or unmounting can never leave an in-flight fetch
 * rescheduling a timer on a dead instance. A wall-clock ceiling stops a never-triggered job
 * from polling forever (Netlify Background Functions run up to ~15 min).
 */

const POLL_MS = 2500
const MAX_POLL_MS = 12 * 60 * 1000 // ceiling: stop polling a stuck/queued job after ~12 min

type Phase = 'loading' | 'sizing' | 'preview' | 'nonviable' | 'failed' | 'stalled'

interface Props {
  reportId: string
  /** Practice center for the boundary map marker + framing (from the list row). */
  center: { lat: number; lng: number } | null
  /** Fired once when a poll reaches a terminal state, so the parent list can refresh its chip. */
  onResolved?: () => void
}

export default function ScoutingResultPanel({ reportId, center, onResolved }: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [parsed, setParsed] = useState<ParsedSizingResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Hold the latest onResolved without making it an effect dependency (keeps the poll from
  // restarting when the parent re-renders and passes a new callback identity).
  const onResolvedRef = useRef(onResolved)
  onResolvedRef.current = onResolved

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const startedAt = Date.now()

    setParsed(null)
    setMessage(null)
    setPhase('loading')

    const poll = async () => {
      try {
        const res = await fetch(`/api/territory-scouting/reports/${reportId}`)
        if (cancelled) return
        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setPhase('failed')
          setMessage(data.error ?? 'Failed to read scouting report')
          return
        }

        const job = data.job as
          | { status: string; result: unknown; error?: { message?: string } | null }
          | null
        if (!job) {
          // Report exists but its job row is gone (job delete cascades sizing_job_id → null).
          setPhase('failed')
          setMessage('This scouting run is no longer available.')
          return
        }

        if (job.status === 'succeeded') {
          const p = parseSizingJobResult(job.result)
          if (p && p.status === 'VIABLE' && p.boundaryFeature) {
            setParsed(p)
            setPhase('preview')
          } else if (p && p.status === 'UNRESOLVED_BELOW_THRESHOLD_AT_CEILING') {
            setParsed(p)
            setPhase('nonviable')
          } else {
            // Terminal success but an unrecognizable payload — surface as an error rather than
            // asserting the definitive "Not viable" business conclusion on garbage.
            setPhase('failed')
            setMessage('The sizing result could not be read.')
          }
          onResolvedRef.current?.()
          return
        }

        if (job.status === 'failed') {
          setPhase('failed')
          setMessage(job.error?.message ?? 'Sizing failed')
          onResolvedRef.current?.()
          return
        }

        // Still queued/running. Stop if we've been polling past the ceiling (e.g. the
        // background trigger never fired) so we never loop indefinitely.
        if (Date.now() - startedAt > MAX_POLL_MS) {
          setPhase('stalled')
          return
        }
        setPhase('sizing')
        timer = setTimeout(poll, POLL_MS)
      } catch (err) {
        if (cancelled) return
        setPhase('failed')
        setMessage(err instanceof Error ? err.message : 'Network error while polling')
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
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

      {phase === 'stalled' && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4">
          <p className="font-heading text-sm font-semibold text-warning">Still sizing</p>
          <p className="mt-1 text-sm text-text-muted">
            This run is taking longer than expected. It may need to be re-run — reopen this report
            later to check on it.
          </p>
        </div>
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
