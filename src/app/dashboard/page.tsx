import { getDashboardData } from '@/lib/dashboard/data'
import DashboardView from './DashboardView'

// Rep-facing internal page — auth-gated by src/middleware.ts. Always dynamic:
// engagement is live and must never be statically cached.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const data = await getDashboardData()
  return <DashboardView data={data} />
}
