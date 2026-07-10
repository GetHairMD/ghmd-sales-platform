import { createClient } from '@/lib/supabase/server'
import { viewerIsExecutive } from '@/lib/auth/internal-role'
import RepCallGradeForm from './RepCallGradeForm'

/**
 * EXEC-ONLY qualification detail: the scored dimensions, background enrichment, and
 * rep-call grading — none of which a rep may ever see (scoping §5, brief §1/§5).
 *
 * This is the ONLY rendered surface that queries qualification_scores /
 * qualification_enrichment / rep_call_grades. It:
 *   • is rendered by the prospect page ONLY inside a `designation === 'executive'`
 *     branch, and
 *   • re-checks `viewerIsExecutive()` here and returns null otherwise (defense in
 *     depth) — so it is never queried for a rep session, not merely hidden by CSS.
 * RLS (`exec_all`, no rep policy) is the hard backstop underneath both.
 */

const SCORE_DIMENSIONS: { key: string; label: string }[] = [
  { key: 'stated_facts', label: 'Stated facts' },
  { key: 'revealed_behavior', label: 'Revealed behavior' },
  { key: 'response_classification', label: 'Response classification' },
  { key: 'follow_through_language', label: 'Follow-through language' },
  { key: 'objections_raised', label: 'Objections raised' },
  { key: 'questions_asked', label: 'Questions asked' },
  { key: 'talk_time_ratio', label: 'Talk-time ratio' },
  { key: 'answer_specificity', label: 'Answer specificity' },
  { key: 'engagement_proxy_textual', label: 'Engagement (textual proxy)' },
  { key: 'affect_energy', label: 'Affect / energy' },
  { key: 'coachability', label: 'Coachability' },
  { key: 'motivation_authenticity', label: 'Motivation authenticity' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'chemistry_fit', label: 'Chemistry / fit' },
]

function fmtScore(v: unknown): string {
  if (v == null || v === '') return '—'
  return String(v)
}

export default async function QualificationExecDetail({ prospectId }: { prospectId: string }) {
  if (!(await viewerIsExecutive())) return null

  const supabase = createClient()
  const [{ data: scores }, { data: enrichment }, { data: grades }] = await Promise.all([
    supabase.from('qualification_scores').select('*').eq('prospect_id', prospectId).maybeSingle(),
    supabase.from('qualification_enrichment').select('*').eq('prospect_id', prospectId).maybeSingle(),
    supabase
      .from('rep_call_grades')
      .select('id, call_date, total_score, grade_data, notes, created_at')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: false }),
  ])

  const scoreRow = scores as Record<string, unknown> | null
  const populated = scoreRow
    ? SCORE_DIMENSIONS.filter((d) => {
        const v = scoreRow[`${d.key}_value`]
        return v != null && v !== ''
      })
    : []

  return (
    <div className="rounded-lg border border-mist bg-bg p-4">
      <p className="font-heading text-xs uppercase tracking-caps text-text-muted">
        Qualification detail <span className="text-text-muted/70">· executive-only</span>
      </p>

      {/* Scored dimensions (read-only; entered manually in Phase 1). */}
      <div className="mt-3">
        <p className="text-xs uppercase tracking-caps text-text-muted">Scored dimensions</p>
        {populated.length === 0 ? (
          <p className="mt-1 text-sm text-text-muted">No scores recorded yet.</p>
        ) : (
          <dl className="mt-1 divide-y divide-mist">
            {populated.map((d) => (
              <div key={d.key} className="flex items-baseline justify-between gap-3 py-1">
                <dt className="text-sm text-text">{d.label}</dt>
                <dd className="text-right text-sm text-text-muted">
                  {fmtScore(scoreRow?.[`${d.key}_value`])}
                  {scoreRow?.[`${d.key}_confidence`] != null && (
                    <span className="ml-2 text-xs">({fmtScore(scoreRow?.[`${d.key}_confidence`])})</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {scoreRow?.score_composite != null && (
          <p className="mt-2 text-sm text-text">
            Composite: <span className="font-heading">{fmtScore(scoreRow.score_composite)}</span>
          </p>
        )}
      </div>

      {/* Background enrichment (non-scored). */}
      {enrichment && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-caps text-text-muted">Background</p>
          <dl className="mt-1 space-y-1 text-sm">
            {enrichment.years_in_practice != null && (
              <div className="flex justify-between"><dt className="text-text-muted">Years in practice</dt><dd className="text-text">{enrichment.years_in_practice}</dd></div>
            )}
            {enrichment.existing_aesthetic_services && (
              <div className="flex justify-between gap-3"><dt className="text-text-muted">Existing aesthetic services</dt><dd className="text-right text-text">{enrichment.existing_aesthetic_services}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-text-muted">Digital footprint</dt><dd className="text-text">{enrichment.digital_footprint_present ? 'Yes' : 'No'}</dd></div>
            <div className="flex justify-between"><dt className="text-text-muted">Prior financing relationship</dt><dd className="text-text">{enrichment.prior_financing_relationship ? 'Yes' : 'No'}</dd></div>
          </dl>
        </div>
      )}

      {/* Rep call grading (exec-only). */}
      <div className="mt-4 border-t border-mist pt-3">
        <p className="text-xs uppercase tracking-caps text-text-muted">Rep call grades</p>
        {grades && grades.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {grades.map((g) => (
              <li key={g.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-text">
                  {g.call_date ?? '—'}
                  {g.notes ? <span className="text-text-muted"> · {g.notes}</span> : null}
                </span>
                <span className="font-heading text-text">{g.total_score ?? '—'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-text-muted">No grades recorded yet.</p>
        )}
        <RepCallGradeForm prospectId={prospectId} />
      </div>
    </div>
  )
}
