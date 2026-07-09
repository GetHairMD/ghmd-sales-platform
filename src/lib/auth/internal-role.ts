/**
 * Internal-user role resolution — the app's ONLY role check today (brief §A, decision #102
 * item 3 + #101). Reads public.internal_users for the current auth user. The `self_read`
 * RLS policy (migration 20260708120000) lets an authenticated user read their OWN row, so
 * this works through the ordinary SSR (anon key + session cookie) client.
 *
 * Narrowly scoped on purpose: it gates only the territory sizing/approve controls. It is NOT
 * a general RBAC layer — that is the deferred "Platform RBAC" project.
 */

import { createClient } from '@/lib/supabase/server'

export type Designation = 'executive' | 'rep'

/**
 * Returns the current viewer's designation, or null when unauthenticated or not on the
 * allow-list (a missing internal_users row). Callers treat anything other than 'executive'
 * as "no sizing/approve controls" (fail closed).
 */
export async function getViewerDesignation(): Promise<Designation | null> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('internal_users')
    .select('designation')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data) return null
  return data.designation === 'executive' ? 'executive' : 'rep'
}

/** Convenience predicate for the sizing/approve gate. */
export async function viewerIsExecutive(): Promise<boolean> {
  return (await getViewerDesignation()) === 'executive'
}
