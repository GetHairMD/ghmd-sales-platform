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
import FinancingCta from '@/components/proposal/FinancingCta'
import PracticeAlignment from '@/components/proposal/PracticeAlignment'
import PlatformSection from '@/components/proposal/PlatformSection'
import ProvenResults from '@/components/proposal/ProvenResults'
import PhysicianVoices from '@/components/proposal/PhysicianVoices'
import TrainingOnboarding from '@/components/proposal/TrainingOnboarding'
import PatientResults from '@/components/proposal/PatientResults'
import NationalNetwork from '@/components/proposal/NationalNetwork'
import Investment from '@/components/proposal/Investment'
import OnboardingLaunch from '@/components/proposal/OnboardingLaunch'
import AdvisoryBoard from '@/components/proposal/AdvisoryBoard'
import CommonQuestions from '@/components/proposal/CommonQuestions'
import NextStep from '@/components/proposal/NextStep'
import StickyBar from '@/components/proposal/StickyBar'
import { CALENDLY_SCHEDULING_URL, deriveProspectFirstDisplay } from '@/components/proposal/constants'
import { withProspectTracking } from '@/lib/proposal/calendly'

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

  // Calendly scheduling URL is public (no secret); prospect attribution rides in
  // utm_content so the webhook can map a booking back. Built server-side to keep
  // node:crypto out of the client bundle. Null until Trace provisions the URL.
  const calendlyUrl = CALENDLY_SCHEDULING_URL
    ? withProspectTracking(CALENDLY_SCHEDULING_URL, proposal.prospect_id)
    : null

  const firstDisplay = deriveProspectFirstDisplay(proposal.prospect_name_full)

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

      {/* 6 — Financing CTA (dark) — hot-lead trigger */}
      <SectionTracker slug={slug} section="financing">
        <FinancingCta slug={slug} />
      </SectionTracker>

      {/* 7 — Practice Alignment (dark) */}
      <SectionTracker slug={slug} section="practice_alignment">
        <PracticeAlignment />
      </SectionTracker>

      {/* 8 — The Platform (light) */}
      <SectionTracker slug={slug} section="platform">
        <PlatformSection />
      </SectionTracker>

      {/* 9 — Proven Results (light) — case-study tabs */}
      <SectionTracker slug={slug} section="proven_results">
        <ProvenResults slug={slug} />
      </SectionTracker>

      {/* 10 — Physician Voices (dark) — Wistia */}
      <SectionTracker slug={slug} section="physician_voices">
        <PhysicianVoices slug={slug} />
      </SectionTracker>

      {/* 11 — Training & Onboarding (light) */}
      <SectionTracker slug={slug} section="training_onboarding">
        <TrainingOnboarding />
      </SectionTracker>

      {/* 12 — Patient Results (Ocean) — claims-gated static shell */}
      <SectionTracker slug={slug} section="patient_results">
        <PatientResults />
      </SectionTracker>

      {/* 13 — National Network (dark) — single sourced count */}
      <SectionTracker slug={slug} section="national_network">
        <NationalNetwork />
      </SectionTracker>

      {/* 14 — Investment (light) — $179K + illustrative ROI snapshot */}
      <SectionTracker slug={slug} section="investment">
        <Investment proposal={proposal} />
      </SectionTracker>

      {/* 15 — Onboarding & Launch (light) */}
      <SectionTracker slug={slug} section="onboarding_launch">
        <OnboardingLaunch />
      </SectionTracker>

      {/* 16 — Clinical Advisory Board (light) */}
      <SectionTracker slug={slug} section="advisory_board">
        <AdvisoryBoard />
      </SectionTracker>

      {/* 17 — Common Questions (always expanded) */}
      <SectionTracker slug={slug} section="common_questions">
        <CommonQuestions />
      </SectionTracker>

      {/* 18 — Next Step (dark) — Calendly + message form */}
      <SectionTracker slug={slug} section="next_step">
        <NextStep
          slug={slug}
          firstDisplay={firstDisplay}
          territoryName={proposal.territory_name}
          calendlyUrl={calendlyUrl}
        />
      </SectionTracker>

      {/* Spacer so the last content clears the fixed sticky bar (spec §9). */}
      <div aria-hidden className="h-20" />

      {/* 19 — Sticky bottom bar (persistent; hides over Next Step) */}
      <StickyBar slug={slug} territoryName={proposal.territory_name} />
    </div>
  )
}
