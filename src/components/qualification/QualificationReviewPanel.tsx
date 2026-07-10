'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { cn } from '@/design/cn'
import {
  QUALIFICATION_RECOMMENDATIONS,
  RECOMMENDATION_LABELS,
  type QualificationRecommendation,
} from '@/lib/qualification/recommendation'
import {
  issueQualificationReview,
  saveQualificationRepNote,
} from '@/app/(app)/prospects/[id]/qualification-actions'

export interface QualificationReviewView {
  recommendation: QualificationRecommendation | null
  ai_summary: string | null
  /** The exec's decision note (qualification_reviews.notes). */
  exec_notes: string | null
  reviewed_at: string | null
  /** The rep's own note (qualification_review_notes.note). */
  rep_note: string | null
}

const TONE: Record<QualificationRecommendation, string> = {
  proceed: 'bg-success/10 text-success border-success/40',
  conditional: 'bg-warning/10 text-shadow border-warning/40',
  not_qualified: 'bg-error/10 text-error border-error/40',
}

function RecommendationBadge({ value }: { value: QualificationRecommendation }) {
  return (
    <span className={cn('inline-flex rounded-md border px-2 py-0.5 font-heading text-xs uppercase tracking-caps', TONE[value])}>
      {RECOMMENDATION_LABELS[value]}
    </span>
  )
}

/**
 * Qualification Review panel — rendered on the Deal Room for the Qualification Review
 * stage. Reads ONLY the rep-safe review fields (recommendation + ai_summary + exec
 * notes) and the rep's own note; it never touches the exec-only scores, enrichment, or
 * rep-call-grade tables (those render in the separate exec-gated detail surface). Execs
 * edit the recommendation + exec note here; reps read the outcome and add their own note.
 */
export default function QualificationReviewPanel({
  prospectId,
  isExecutive,
  initial,
}: {
  prospectId: string
  isExecutive: boolean
  initial: QualificationReviewView
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Exec-editable recommendation + exec note.
  const [rec, setRec] = useState<QualificationRecommendation | ''>(initial.recommendation ?? '')
  const [execNote, setExecNote] = useState(initial.exec_notes ?? '')

  // Rep-editable own note.
  const [repNote, setRepNote] = useState(initial.rep_note ?? '')

  function saveReview() {
    setError(null)
    if (!rec) {
      setError('Choose a recommendation.')
      return
    }
    startTransition(async () => {
      const res = await issueQualificationReview(prospectId, rec, execNote || null)
      if (!res.ok) setError(res.error ?? 'Could not save the review.')
      else router.refresh()
    })
  }

  function saveNote() {
    setError(null)
    startTransition(async () => {
      const res = await saveQualificationRepNote(prospectId, repNote || null)
      if (!res.ok) setError(res.error ?? 'Could not save your note.')
      else router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-mist bg-bg p-4">
      <div className="flex items-center justify-between">
        <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Qualification Review</p>
        {initial.recommendation && <RecommendationBadge value={initial.recommendation} />}
      </div>

      {/* AI summary — the "why", shown to both roles once Phase 2 populates it. */}
      {initial.ai_summary && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-mist/60 p-2 text-sm text-text">{initial.ai_summary}</p>
      )}

      {isExecutive ? (
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-caps text-text-muted">Recommendation</label>
            <select
              value={rec}
              onChange={(e) => setRec(e.target.value as QualificationRecommendation)}
              disabled={pending}
              className="w-full rounded-md border border-mist bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <option value="">Select…</option>
              {QUALIFICATION_RECOMMENDATIONS.map((r) => (
                <option key={r} value={r}>
                  {RECOMMENDATION_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-caps text-text-muted">Reviewer note</label>
            <textarea
              value={execNote}
              onChange={(e) => setExecNote(e.target.value)}
              disabled={pending}
              rows={3}
              placeholder="Optional rationale for the recommendation."
              className="w-full rounded-md border border-mist bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </div>
          <Button size="sm" onClick={saveReview} disabled={pending}>
            {initial.recommendation ? 'Update review' : 'Issue review'}
          </Button>
          <p className="text-xs text-text-muted">
            A “Proceed” recommendation is required before this prospect can advance past Qualification Review.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {!initial.recommendation && (
            <p className="text-sm text-text-muted">Awaiting an executive review.</p>
          )}
          {initial.exec_notes && (
            <div>
              <p className="text-xs uppercase tracking-caps text-text-muted">Reviewer note</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text">{initial.exec_notes}</p>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-caps text-text-muted">Your note</label>
            <textarea
              value={repNote}
              onChange={(e) => setRepNote(e.target.value)}
              disabled={pending}
              rows={3}
              placeholder="Add your note on this review."
              className="w-full rounded-md border border-mist bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <Button size="sm" className="mt-2" onClick={saveNote} disabled={pending}>
              Save note
            </Button>
          </div>
        </div>
      )}

      {/* For execs, surface the rep's note read-only if present. */}
      {isExecutive && initial.rep_note && (
        <div className="mt-3 border-t border-mist pt-3">
          <p className="text-xs uppercase tracking-caps text-text-muted">Rep note</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text">{initial.rep_note}</p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </div>
  )
}
