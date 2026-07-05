'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { trackProposalEvent } from './analytics'

/**
 * Wraps a proposal section and fires one `section_view` event the first time it
 * scrolls meaningfully into view (IntersectionObserver, brief §7).
 */
export default function SectionTracker({
  slug,
  section,
  children,
  className,
}: {
  slug: string
  section: string
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || fired.current) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !fired.current) {
            fired.current = true
            trackProposalEvent(slug, 'section_view', { section })
            obs.disconnect()
          }
        }
      },
      { threshold: 0.4 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [slug, section])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
