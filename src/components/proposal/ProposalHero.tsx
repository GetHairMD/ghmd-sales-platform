import Logo from '@/components/brand/Logo'
import Button from '@/components/ui/Button'
import { cn } from '@/design/cn'
import type { ProposalRecord } from '@/lib/proposal/types'
import { STAT_STRIP } from './constants'

interface ProposalHeroProps {
  proposal: ProposalRecord
}

/** One field of the 4-up practice card — all-caps label + graceful value. */
function HeroField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="font-heading text-xs uppercase tracking-caps text-text-inverse/50">
        {label}
      </dt>
      <dd className="mt-1 font-serif text-base text-text-inverse">{value?.trim() || '—'}</dd>
    </div>
  )
}

/**
 * Section 2 — dark hero. Brand lockup, headline with the territory set in Cardo
 * italic accent, a 4-field practice card, dual anchor CTAs, and a category stat
 * strip. Server component: presentational only, final values passed as props.
 */
export default function ProposalHero({ proposal }: ProposalHeroProps) {
  const territory = proposal.territory_name?.trim() || 'your market'

  return (
    <section className="bg-black px-6 py-16 text-text-inverse sm:py-24">
      <div className="mx-auto max-w-4xl text-center">
        {/* Brand lockup (+ optional co-branded practice logo) */}
        <div className="flex items-center justify-center gap-4">
          <Logo variant="white" width={160} priority />
          {proposal.practice_logo_url && (
            <>
              <span className="text-2xl text-text-inverse/40" aria-hidden="true">
                &times;
              </span>
              {/* External URL → plain <img>, not the brand Logo component. */}
              <img
                src={proposal.practice_logo_url}
                alt={proposal.practice_name ?? 'Practice logo'}
                className="h-10 w-auto"
              />
            </>
          )}
        </div>

        {/* Headline — territory name in Cardo italic accent */}
        <h1 className="mt-12 font-heading text-4xl font-bold sm:text-6xl">
          A protected opportunity in{' '}
          <span className="font-serif italic text-accent">{territory}</span>
        </h1>

        {proposal.prospect_name_full && (
          <p className="mt-4 font-serif text-lg text-text-inverse/80">
            {proposal.prospect_name_full}
          </p>
        )}

        {/* 4-field practice card */}
        <dl
          className={cn(
            'mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-6 rounded-xl border border-text-inverse/15 p-6 text-left sm:grid-cols-4',
          )}
        >
          <HeroField label="Practice" value={proposal.practice_name} />
          <HeroField label="Specialty" value={proposal.specialty} />
          <HeroField label="Territory" value={proposal.territory_name} />
          <HeroField label="Prepared" value={proposal.prepared_month} />
        </dl>

        {/* Dual CTAs — simple anchor links, no analytics, no financing language */}
        <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href="#practice-opportunity" className="inline-flex">
            <Button variant="primary" size="lg">
              Explore the opportunity
            </Button>
          </a>
          <a href="#territory-analysis" className="inline-flex">
            <Button variant="secondary" size="lg">
              Talk to your representative
            </Button>
          </a>
        </div>

        {/* Category stat strip */}
        <div className="mt-16 grid grid-cols-2 gap-8 border-t border-text-inverse/15 pt-12 sm:grid-cols-4">
          {STAT_STRIP.map((stat) => (
            <div key={stat.label}>
              <div className="font-heading text-3xl font-bold text-accent">{stat.value}</div>
              <div className="mt-1 text-xs uppercase tracking-caps text-text-inverse/60">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
