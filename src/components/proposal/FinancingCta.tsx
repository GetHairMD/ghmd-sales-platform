'use client'

import Button from '@/components/ui/Button'
import { trackProposalEvent } from './analytics'

/**
 * Section 6 — dark financing CTA (spec §6.6). The click is a hot-lead trigger:
 * it fires financing_cta_click (spec §7) and moves the prospect to the Next Step
 * scheduler. No lending-mechanics or formula language ever appears here (public
 * page carries zero viability semantics — Hard Rule 2).
 */
export default function FinancingCta({ slug }: { slug: string }) {
  return (
    <section id="financing" className="bg-black px-6 py-16 text-text-inverse sm:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-heading text-3xl font-bold sm:text-4xl">
          See what financing you qualify for
        </h2>
        <p className="mt-4 font-serif text-lg text-text-inverse/80">
          Flexible options are available to help you launch. Start the conversation and
          we&rsquo;ll walk you through what fits.
        </p>
        <div className="mt-10">
          <a href="#next-step" className="inline-flex">
            <Button
              variant="primary"
              size="lg"
              onClick={() => trackProposalEvent(slug, 'financing_cta_click', {})}
            >
              Explore financing options
            </Button>
          </a>
        </div>
      </div>
    </section>
  )
}
