'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Tabs from '@/components/ui/Tabs'
import { trackProposalEvent } from './analytics'
import { CASE_STUDIES } from './constants'

/**
 * Section 9 — light. Three case-study tabs (spec §6.9). Static, approval-pending
 * copy from constants (no earnings figures — spec §10 ⚠). Each tab change fires
 * case_study_tab (spec §7).
 */
export default function ProvenResults({ slug }: { slug: string }) {
  const [active, setActive] = useState(CASE_STUDIES[0]?.key ?? '')
  const current = CASE_STUDIES.find((c) => c.key === active) ?? CASE_STUDIES[0]

  function onTab(key: string) {
    setActive(key)
    trackProposalEvent(slug, 'case_study_tab', { case_study: key })
  }

  return (
    <section id="proven-results" className="bg-bg px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl">
        <h2 className="font-heading text-3xl font-bold text-text sm:text-4xl">Proven results</h2>
        <p className="mt-3 max-w-2xl font-serif text-lg text-text-muted">
          Practices already operating within the network.
        </p>

        <div className="mt-8 overflow-x-auto">
          <Tabs
            tabs={CASE_STUDIES.map((c) => ({ key: c.key, label: c.label }))}
            value={active}
            onValueChange={onTab}
            className="min-w-max"
          />
        </div>

        {current && (
          <Card padding="lg" className="mt-6">
            <h3 className="font-heading text-xl font-bold text-text">{current.headline}</h3>
            <p className="mt-3 font-serif text-base text-text-muted">{current.body}</p>
          </Card>
        )}
      </div>
    </section>
  )
}
