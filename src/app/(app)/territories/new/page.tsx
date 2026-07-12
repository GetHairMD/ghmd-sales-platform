import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getViewerDesignation } from '@/lib/auth/internal-role'
import NewTerritoryForm from '@/components/territory/NewTerritoryForm'

/**
 * Create a new (draft) territory — executive-only. The territory detail page HIDES the
 * exec panel from reps, but a creation page has nothing left to show a rep, so we redirect
 * rather than render an empty gate. Fail closed: getViewerDesignation() returns null on any
 * auth hiccup, which is treated as non-executive.
 */
export default async function NewTerritoryPage() {
  const designation = await getViewerDesignation()
  if (designation !== 'executive') {
    redirect('/territories')
  }

  return (
    <main className="mx-auto max-w-lg p-6 sm:p-8">
      <Link
        href="/territories"
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Territories
      </Link>
      <h1 className="font-heading text-2xl font-bold text-text">New Territory</h1>
      <p className="mb-6 mt-1 text-sm text-text-muted">
        Create a draft, then size and approve its drive-time boundary.
      </p>
      <NewTerritoryForm />
    </main>
  )
}
