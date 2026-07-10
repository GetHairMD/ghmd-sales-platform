'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { viewerIsExecutive } from '@/lib/auth/internal-role'
import {
  isQualificationRecommendation,
  type QualificationRecommendation,
} from '@/lib/qualification/recommendation'

export interface ActionResult {
  ok: boolean
  error?: string
}

/**
 * Issue (or edit-in-place) a prospect's qualification review — EXEC ONLY.
 *
 * `recommendation` is the gate signal (proceed / conditional / not_qualified). Upserts
 * on prospect_id (one review per prospect; scoping §3.1 "conditional re-scores edit the
 * row in place"). Records the issuing exec + timestamp. Runs as the authenticated user,
 * so RLS's `exec_all` policy is the hard boundary; the explicit `viewerIsExecutive()`
 * check is defense-in-depth and gives a clean error rather than an opaque RLS failure.
 * `ai_summary` is NOT written here — it is Phase 2 (Zoom/AI) only.
 */
export async function issueQualificationReview(
  prospectId: string,
  recommendation: QualificationRecommendation,
  notes: string | null,
): Promise<ActionResult> {
  if (!isQualificationRecommendation(recommendation)) {
    return { ok: false, error: `invalid recommendation "${recommendation}"` }
  }
  if (!(await viewerIsExecutive())) {
    return { ok: false, error: 'Only an executive can issue a qualification recommendation.' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not authenticated' }

  const now = new Date().toISOString()
  const { error } = await supabase.from('qualification_reviews').upsert(
    {
      prospect_id: prospectId,
      recommendation,
      notes: notes?.trim() ? notes.trim() : null,
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now,
    },
    { onConflict: 'prospect_id' },
  )
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/prospects/${prospectId}`)
  revalidatePath('/pipeline')
  return { ok: true }
}

/**
 * Write (or edit-in-place) the rep's note on a prospect's qualification review.
 *
 * Writes ONLY `qualification_review_notes` — a table the rep can write for their own
 * assigned prospect (RLS: rep_insert_own / rep_update_own), and which holds NONE of the
 * exec-issued fields. The rep therefore cannot touch recommendation / reviewed_by /
 * reviewed_at / ai_summary through any path — those live on `qualification_reviews`,
 * where the rep has no write policy at all (PR3 §2). Execs may also write here via
 * `exec_all`. `author_id` is stamped to the caller so a rep can only author as
 * themselves (also enforced by the policy WITH CHECK).
 */
export async function saveQualificationRepNote(
  prospectId: string,
  note: string | null,
): Promise<ActionResult> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not authenticated' }

  const { error } = await supabase.from('qualification_review_notes').upsert(
    {
      prospect_id: prospectId,
      author_id: user.id,
      note: note?.trim() ? note.trim() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prospect_id' },
  )
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/prospects/${prospectId}`)
  return { ok: true }
}

export interface RepCallGradeInput {
  totalScore: number | null
  callDate: string | null
  /** Structured per-criterion detail; free-form for Phase 1. */
  gradeData: Record<string, unknown> | null
  notes: string | null
}

/**
 * Record a grade of a rep's call performance for a prospect — EXEC ONLY.
 *
 * Writes `rep_call_grades`, which has NO rep policy at all (exec-only from PR1) — reps
 * get zero visibility, not just zero UI. Multiple grades per prospect (per call), so
 * this INSERTs (no upsert). Distinct from `call_scores` (rep-visible self-coaching,
 * decision #53). `viewerIsExecutive()` gives a clean error; RLS `exec_all` is the hard
 * boundary.
 */
export async function addRepCallGrade(
  prospectId: string,
  input: RepCallGradeInput,
): Promise<ActionResult> {
  if (!(await viewerIsExecutive())) {
    return { ok: false, error: 'Only an executive can grade rep call performance.' }
  }
  if (input.totalScore != null && (input.totalScore < 0 || input.totalScore > 100)) {
    return { ok: false, error: 'total score must be between 0 and 100' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not authenticated' }

  const { error } = await supabase.from('rep_call_grades').insert({
    prospect_id: prospectId,
    graded_by: user.id,
    call_date: input.callDate || null,
    total_score: input.totalScore,
    grade_data: input.gradeData,
    notes: input.notes?.trim() ? input.notes.trim() : null,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/prospects/${prospectId}`)
  return { ok: true }
}
