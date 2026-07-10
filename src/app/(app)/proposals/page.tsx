import { getProposalsData } from '@/lib/proposals/data'
import ProposalsView from './ProposalsView'

// Rep-facing internal page — auth-gated by src/middleware.ts (same as /dashboard).
// Always dynamic: engagement is live and must never be statically cached.
export const dynamic = 'force-dynamic'

export default async function ProposalsPage() {
  const rows = await getProposalsData()
  return <ProposalsView rows={rows} />
}
