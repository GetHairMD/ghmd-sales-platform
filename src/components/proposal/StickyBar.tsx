'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/design/cn'
import { trackProposalEvent } from './analytics'
import { NEXT_STEP_REP } from './constants'

/**
 * Section 19 — persistent bottom bar (spec §6.19), mobile-persistent. "Reserve
 * {territory} — talk to {rep}" + GET STARTED, which fires get_started_click
 * (spec §7) and anchors to Next Step (§18).
 *
 * To satisfy spec §9 ("sticky bar must not obscure the final CTA form on
 * mobile"), the bar hides itself while the Next Step section is in view — so it
 * is never over the form the prospect is filling. A page-end spacer (in page.tsx)
 * keeps the last content scrollable above the bar everywhere else.
 */
export default function StickyBar({
  slug,
  territoryName,
}: {
  slug: string
  territoryName: string | null
}) {
  const territory = territoryName?.trim() || 'your territory'
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const target = document.getElementById('next-step')
    if (!target) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setHidden(entry.isIntersecting)
      },
      { threshold: 0.05 },
    )
    obs.observe(target)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-text-inverse/15 bg-black text-text-inverse',
        'transition-transform duration-base ease-standard',
        hidden ? 'translate-y-full' : 'translate-y-0',
      )}
      aria-hidden={hidden}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <p className="min-w-0 truncate font-serif text-sm sm:text-base">
          Reserve <span className="text-accent">{territory}</span> — talk to {NEXT_STEP_REP.name}
        </p>
        <a
          href="#next-step"
          onClick={() => trackProposalEvent(slug, 'get_started_click', {})}
          className={cn(
            'shrink-0 rounded-md bg-primary px-4 py-2 font-heading text-xs uppercase tracking-caps text-text-inverse',
            'transition-colors duration-base ease-standard hover:bg-primary/90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          )}
        >
          Get started
        </a>
      </div>
    </div>
  )
}
