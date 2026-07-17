import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getViewerDesignation } from '@/lib/auth/internal-role'
import { getRepCommandCenterData } from '@/lib/rep-command-center/data'
import RepCommandCenterView from '@/components/rep-command-center/RepCommandCenterView'

// Reads auth cookies + live metrics — never static.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Rep Command Center (spec §4D, decision #169) — executive-only management view:
 * per-rep performance, gross-vs-net (discount-aware) close value, and per-deal
 * drill-down. Scope is reps only — executives are graders here, not graded.
 *
 * ⚠ CONCEALMENT, NOT ACCESS DENIAL — INTENTIONAL DIVERGENCE FROM TERRITORY
 * SCOUTING. DO NOT "FIX" THIS TO A 403 OR A /dashboard REDIRECT FOR CONSISTENCY.
 * Territory Scouting's requirement is access denial (its page redirects, its API
 * routes 403). §4D's requirement is CONCEALMENT OF EXISTENCE: to any
 * non-executive this route must be indistinguishable from a URL that was never
 * built. notFound() renders the site's REAL 404 boundary — the same response an
 * unmatched route produces — so a rep probing /rep-command-center learns nothing.
 * The same rule covers the head: generateMetadata gates BEFORE returning a title,
 * so a non-executive response never carries "Rep Command Center" anywhere in it.
 *
 * There are deliberately ZERO backing API routes for this feature — every metric
 * is computed server-side in this page's render (lib/rep-command-center). Routes
 * that do not exist return the genuine 404 to everyone, which satisfies §4D's
 * "every backing API route returns an indistinguishable 404" by construction.
 *
 * Fail closed: getViewerDesignation() yields null on any auth hiccup (and for
 * unauthenticated visitors while AUTH_GATE_DISABLED is live, #136/#137) — null
 * is not 'executive', so every failure mode lands on the 404.
 */
export async function generateMetadata(): Promise<Metadata> {
  const designation = await getViewerDesignation()
  if (designation !== 'executive') {
    // Same concealment rule as the page body: no title leak in a rep's <head>.
    notFound()
  }
  return { title: 'Rep Command Center — GHMD Sales' }
}

export default async function RepCommandCenterPage() {
  const designation = await getViewerDesignation()
  if (designation !== 'executive') {
    notFound() // see header comment — 404 by design, never 403/redirect
  }

  const { reps } = await getRepCommandCenterData()

  return (
    <main className="p-6">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text">Rep Command Center</h1>
        <p className="mt-1 text-sm text-text-muted">
          Who&rsquo;s doing what, how they&rsquo;re performing, and how money is actually moving —
          including negotiated exceptions to list price. Executive eyes only.
        </p>
      </header>
      <RepCommandCenterView reps={reps} />
    </main>
  )
}
