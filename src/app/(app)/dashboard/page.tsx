import { getDashboardData } from '@/lib/dashboard/data'
import { createClient } from '@/lib/supabase/server'
import { getViewerDesignation } from '@/lib/auth/internal-role'
import DashboardView from './DashboardView'

// Rep-facing internal page — auth-gated by src/middleware.ts. Always dynamic:
// engagement is live and must never be statically cached.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Resolve the viewer so the Resource Library feed renders the right split (AC8a/AC8b):
  // a rep sees opens on their OWN prospects; an executive sees ALL reps', attributed.
  const supabase = createClient()
  const [
    {
      data: { user },
    },
    designation,
  ] = await Promise.all([supabase.auth.getUser(), getViewerDesignation()])

  const data = await getDashboardData({ designation, userId: user?.id ?? null })
  return <DashboardView data={data} />
}
