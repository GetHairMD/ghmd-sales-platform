'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { addRepCallGrade } from '@/app/prospects/[id]/qualification-actions'

/** Compact, structured criteria bundled into rep_call_grades.grade_data (jsonb). */
const CRITERIA = ['Rapport', 'Discovery', 'Objection handling', 'Next steps'] as const

/**
 * Exec-only entry surface for grading a rep's call performance (rep_call_grades).
 * Small by design (PR3 §5) — not the headline feature. Rendered only inside the
 * exec-gated QualificationExecDetail. Reps have no policy on rep_call_grades, so they
 * get zero visibility, not just zero UI.
 */
export default function RepCallGradeForm({ prospectId }: { prospectId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [totalScore, setTotalScore] = useState('')
  const [callDate, setCallDate] = useState('')
  const [notes, setNotes] = useState('')
  const [criteria, setCriteria] = useState<Record<string, string>>({})

  function submit() {
    setError(null)
    const total = totalScore.trim() === '' ? null : Number(totalScore)
    if (total != null && (!Number.isFinite(total) || total < 0 || total > 100)) {
      setError('Total score must be 0–100.')
      return
    }
    const gradeData = Object.fromEntries(
      CRITERIA.map((c) => [c, criteria[c]?.trim() ? Number(criteria[c]) : null]).filter(([, v]) => v != null),
    )
    startTransition(async () => {
      const res = await addRepCallGrade(prospectId, {
        totalScore: total,
        callDate: callDate || null,
        gradeData: Object.keys(gradeData).length ? gradeData : null,
        notes: notes || null,
      })
      if (!res.ok) {
        setError(res.error ?? 'Could not save the grade.')
      } else {
        setTotalScore('')
        setCallDate('')
        setNotes('')
        setCriteria({})
        router.refresh()
      }
    })
  }

  const input =
    'w-full rounded-md border border-mist bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50'

  return (
    <div className="mt-3 rounded-md border border-mist bg-bg p-3">
      <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Grade a call</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[0.6875rem] uppercase tracking-caps text-text-muted">Total score (0–100)</label>
          <input type="number" min={0} max={100} value={totalScore} onChange={(e) => setTotalScore(e.target.value)} disabled={pending} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-[0.6875rem] uppercase tracking-caps text-text-muted">Call date</label>
          <input type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} disabled={pending} className={input} />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {CRITERIA.map((c) => (
          <div key={c}>
            <label className="mb-1 block text-[0.6875rem] uppercase tracking-caps text-text-muted">{c} (0–10)</label>
            <input
              type="number"
              min={0}
              max={10}
              value={criteria[c] ?? ''}
              onChange={(e) => setCriteria((prev) => ({ ...prev, [c]: e.target.value }))}
              disabled={pending}
              className={input}
            />
          </div>
        ))}
      </div>
      <div className="mt-2">
        <label className="mb-1 block text-[0.6875rem] uppercase tracking-caps text-text-muted">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} className={input} />
      </div>
      <Button size="sm" className="mt-2" onClick={submit} disabled={pending}>
        Save grade
      </Button>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </div>
  )
}
