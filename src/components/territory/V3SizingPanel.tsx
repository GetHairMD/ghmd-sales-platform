'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import AddressableVsFloor from './AddressableVsFloor'
import TerritoryBoundaryMap from './TerritoryBoundaryMap'
import { parseSizingJobResult, type ParsedSizingResult } from '@/lib/territories/v3-display'

/**
 * Executive-only v3 sizing workflow (brief §B). Size → poll → preview (addressable-vs-floor,
 * no minutes) → Approve. The SAME control drives first sizing ("Size with v3") and re-opening
 * an approved territory ("Re-size / re-open for review") — approving overwrites the boundary;
 * there is no separate negotiation flow and no new state (AC5). Approve is refused for
 * sold/reserved territories (AC4) and never offered for a non-viable result (AC6).
 *
 * This is a convenience layer only — the /approve route re-checks the executive gate and all
 * preconditions server-side.
 */

type Phase = 'idle' | 'sizing' | 'preview' | 'nonviable' | 'failed' | 'approving'

export interface InitialSizingJob {
  jobId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  result: unknown
  error?: { message?: string } | null
}

interface Props {
  territoryId: string
  territoryStatus: string | null
  mode: 'size' | 'resize'
  center?: { lat: number; lng: number } | null
  initialJob?: InitialSizingJob | null
}

const POLL_MS = 2500

function deriveFromJob(status: string, result: unknown): { phase: Phase; parsed: ParsedSizingResult | null } {
  if (status === 'succeeded') {
    const parsed = parseSizingJobResult(result)
    if (parsed && parsed.status === 'VIABLE' && parsed.boundaryFeature) return { phase: 'preview', parsed }
    return { phase: 'nonviable', parsed }
  }
  if (status === 'failed') return { phase: 'failed', parsed: null }
  if (status === 'queued' || status === 'running') return { phase: 'sizing', parsed: null }
  return { phase: 'idle', parsed: null }
}

export default function V3SizingPanel({ territoryId, territoryStatus, mode, center, initialJob }: Props) {
  const router = useRouter()
  const initial = initialJob ? deriveFromJob(initialJob.status, initialJob.result) : { phase: 'idle' as Phase, parsed: null }

  const [phase, setPhase] = useState<Phase>(initial.phase)
  const [parsed, setParsed] = useState<ParsedSizingResult | null>(initial.parsed)
  const [jobId, setJobId] = useState<string | null>(initialJob?.jobId ?? null)
  const [message, setMessage] = useState<string | null>(
    initialJob?.status === 'failed' ? initialJob.error?.message ?? 'Sizing failed' : null,
  )
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const statusLocked = territoryStatus === 'sold' || territoryStatus === 'reserved'

  const clearPoll = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }

  const poll = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/territories/size/${id}`)
        const data = await res.json()
        if (!res.ok) {
          setPhase('failed')
          setMessage(data.error ?? 'Failed to read sizing status')
          return
        }
        if (data.status === 'succeeded' || data.status === 'failed') {
          const d = deriveFromJob(data.status, data.result)
          setParsed(d.parsed)
          setPhase(d.phase)
          if (data.status === 'failed') setMessage(data.error?.message ?? 'Sizing failed')
          return
        }
        pollRef.current = setTimeout(() => poll(id), POLL_MS) // still queued/running
      } catch (err) {
        setPhase('failed')
        setMessage(err instanceof Error ? err.message : 'Network error while polling')
      }
    },
    [],
  )

  // Resume polling if we mounted mid-flight (e.g. page reload during a sizing run).
  useEffect(() => {
    if (phase === 'sizing' && jobId) {
      pollRef.current = setTimeout(() => poll(jobId), POLL_MS)
    }
    return clearPoll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startSizing = async () => {
    clearPoll()
    setMessage(null)
    setParsed(null)
    setPhase('sizing')
    try {
      const res = await fetch('/api/territories/size', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ territoryId }),
      })
      const data = await res.json()
      if (!res.ok || !data.jobId) {
        setPhase('failed')
        setMessage(data.error ?? 'Failed to start sizing')
        return
      }
      setJobId(data.jobId)
      pollRef.current = setTimeout(() => poll(data.jobId), POLL_MS)
    } catch (err) {
      setPhase('failed')
      setMessage(err instanceof Error ? err.message : 'Network error starting sizing')
    }
  }

  const approve = async () => {
    if (!jobId) return
    setPhase('approving')
    setMessage(null)
    try {
      const res = await fetch(`/api/territories/${territoryId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPhase('preview')
        setMessage(data.error ?? 'Failed to approve territory')
        return
      }
      // Server now renders the approved v3 view; refresh to swap the whole page over.
      router.refresh()
    } catch (err) {
      setPhase('preview')
      setMessage(err instanceof Error ? err.message : 'Network error approving')
    }
  }

  const sizeLabel = mode === 'resize' ? 'Re-size / re-open for review' : 'Size with v3'

  return (
    <section className="rounded-lg border border-mist bg-bg p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-heading text-xs uppercase tracking-caps text-text-muted">
            Internal — executive only
          </p>
          <p className="mt-0.5 text-sm text-text-muted">
            {mode === 'resize'
              ? 'Re-open this approved territory for review. Approving again overwrites the saved boundary.'
              : 'Size this territory with the v3 drive-time engine, then approve to publish its boundary.'}
          </p>
        </div>
        <Button
          size="sm"
          variant={mode === 'resize' ? 'secondary' : 'primary'}
          onClick={startSizing}
          loading={phase === 'sizing'}
          disabled={phase === 'sizing' || phase === 'approving'}
        >
          {phase === 'sizing' ? 'Sizing…' : sizeLabel}
        </Button>
      </div>

      {message && (
        <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {message}
        </p>
      )}

      {phase === 'sizing' && (
        <p className="text-sm text-text-muted">
          Sizing in progress — this can take up to a couple of minutes for dense metros.
        </p>
      )}

      {phase === 'nonviable' && (
        <div className="rounded-md border border-error/40 bg-error/5 p-4">
          <p className="font-heading text-sm font-semibold text-error">Not viable</p>
          <p className="mt-1 text-sm text-text-muted">
            Even at the maximum drive-time this location does not reach the{' '}
            {(18600).toLocaleString()} addressable floor
            {parsed ? ` (best achieved: ${Math.round(parsed.addressable).toLocaleString()})` : ''}. There
            is nothing to approve — pricing is a separate decision.
          </p>
        </div>
      )}

      {(phase === 'preview' || phase === 'approving') && parsed?.boundaryFeature && (
        <div className="space-y-4">
          <p className="font-heading text-xs uppercase tracking-caps text-text-muted">
            Preview — not yet published
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AddressableVsFloor addressable={parsed.addressable} />
            <div className="lg:row-span-1">
              <TerritoryBoundaryMap feature={parsed.boundaryFeature} center={center ?? null} height={220} />
            </div>
          </div>
          {statusLocked ? (
            <p className="rounded-md border border-mist bg-mist/40 px-3 py-2 text-sm text-text-muted">
              This territory is <span className="font-semibold capitalize">{territoryStatus}</span> — its
              boundary is locked and cannot be re-approved from here.
            </p>
          ) : (
            <Button onClick={approve} loading={phase === 'approving'}>
              Approve this territory
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
