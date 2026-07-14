import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { viewerIsExecutive } from '@/lib/auth/internal-role'

// Reads cookies (exec gate) then a service-role list — never static.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/internal-users/reps — executive-only list of reps for the "assign to" selector
 * on prospect creation (PR #124, decision #150).
 *
 * Why service-role: internal_users' only SELECT policy is `self_read`
 * (user_id = auth.uid()), so an executive's own RLS-scoped client can read only its OWN row
 * — never the rep roster. Rather than widen internal_users RLS (kept as narrow as it is
 * today, on purpose), the executive gate lives IN CODE here and the roster is read through
 * the service-role client. Same authorization shape as /api/territory-scouting/reports*:
 * auth.getUser() → 401, viewerIsExecutive() → 403, then the privileged read.
 *
 * Returns ONLY designation='rep' rows, and ONLY (user_id, full_name) — executive rows are
 * never returned from this endpoint.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!(await viewerIsExecutive())) {
    return NextResponse.json({ error: 'Executive access required' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('internal_users')
    .select('user_id, full_name')
    .eq('designation', 'rep')
    .order('full_name', { ascending: true, nullsFirst: false })
  if (error) {
    return NextResponse.json({ error: 'Failed to load reps', detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ reps: data ?? [] })
}
