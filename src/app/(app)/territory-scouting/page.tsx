import { redirect } from 'next/navigation'
import { getViewerDesignation } from '@/lib/auth/internal-role'
import TerritoryScoutingClient from '@/components/territory-scouting/TerritoryScoutingClient'

export const metadata = {
  title: 'Territory Scouting — GHMD Sales',
}

/**
 * Territory Scouting (decision #146) — executive-only, deal-independent market scouting:
 * locate → size (v3 drive-time engine) → view addressable-vs-floor result. Standalone from
 * the New Territory flow; a scouting report is never rep-visible, never on the National Map,
 * and never promoted to a real territory in v1.
 *
 * Page-level gate mirrors /territories/new: fail closed on any auth hiccup
 * (getViewerDesignation() returns null on error, treated as non-executive). Redirects to
 * /dashboard — Territory Scouting is not a sub-flow of Deal Territories, so there is no
 * territories page to fall back to.
 */
export default async function TerritoryScoutingPage() {
  const designation = await getViewerDesignation()
  if (designation !== 'executive') {
    redirect('/dashboard')
  }

  return (
    <main className="p-6">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text">Territory Scouting</h1>
        <p className="mt-1 text-sm text-text-muted">
          Scout any location&rsquo;s addressable market with the drive-time sizing engine. For
          strategic planning only — scouting runs are internal and never become deal territories.
        </p>
      </header>
      <TerritoryScoutingClient />
    </main>
  )
}
