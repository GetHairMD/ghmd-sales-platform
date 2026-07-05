import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PROPOSAL_COOKIE_NAME, verifyProposalCookie } from '@/lib/proposal/gate'
import { getProposalBySlug } from '@/lib/proposal/data'
import { penetrationScenarios, SCENARIO_DISPLAY_LABEL } from '@/lib/territory-sizing'
import AccessCodeGate from '@/components/proposal/AccessCodeGate'
import SectionTracker from '@/components/proposal/SectionTracker'
import ConfidentialTopBar from '@/components/proposal/ConfidentialTopBar'
import ProposalHero from '@/components/proposal/ProposalHero'
import PracticeOpportunity from '@/components/proposal/PracticeOpportunity'
import TerritoryAnalysis from '@/components/proposal/TerritoryAnalysis'
import ScarcityBanner from '@/components/proposal/ScarcityBanner'

export const dynamic = 'force-dynamic'

// Confidential buyer-facing page — never indexed (PRD §3.3).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function ProposalSlugPage({ params }: { params: { slug: string } }) {
  const { slug } = params

  // Gate: verify the signed unlock cookie BEFORE any data fetch. Pre-auth we
  // render only the code prompt — zero prospect data reaches the client.
  const unlock = verifyProposalCookie(cookies().get(PROPOSAL_COOKIE_NAME)?.value, slug)
  if (!unlock) {
    return <AccessCodeGate slug={slug} />
  }

  const proposal = await getProposalBySlug(slug)
  if (!proposal) return notFound()

  // Penetration scenarios (Conservative/Base/Upside) are computed on render, not
  // stored (brief §3). Computed SERVER-side here so the formula constants never
  // reach the client bundle; only final customer counts are passed down. The
  // internal-only floor signals are deliberately not forwarded to the client.
  const penetration =
    proposal.addressable_market_total != null
      ? penetrationScenarios(proposal.addressable_market_total).scenarios.map((s) => ({
          label: SCENARIO_DISPLAY_LABEL[s.key],
          rate: s.rate,
          customers: Math.round(s.customers),
        }))
      : []

  return (
    <div className="min-h-screen bg-bg font-body text-text">
      {/* 1 — Confidential top bar */}
      <ConfidentialTopBar name={proposal.prospect_name_full} />

      {/* 2 — Hero (dark) */}
      <SectionTracker slug={slug} section="hero">
        <ProposalHero proposal={proposal} />
      </SectionTracker>

      {/* 3 — Practice Opportunity (light) */}
      <SectionTracker slug={slug} section="practice_opportunity">
        <PracticeOpportunity slug={slug} proposal={proposal} penetration={penetration} />
      </SectionTracker>

      {/* 4 — Territory Analysis (light) */}
      <SectionTracker slug={slug} section="territory_analysis">
        <TerritoryAnalysis proposal={proposal} />
      </SectionTracker>

      {/* 5 — Scarcity banner (immediately after Territory Analysis) */}
      <ScarcityBanner territoryName={proposal.territory_name} />
    </div>
  )
}
