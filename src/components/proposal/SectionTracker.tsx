'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { trackProposalEvent } from './analytics'

/**
 * Wraps a proposal section and emits two first-party events (spec §7):
 *   • section_view  — once, the first time it scrolls meaningfully into view.
 *   • section_dwell — accumulated visible time (ms), flushed when the section
 *     leaves view, the tab is hidden, or the component unmounts.
 *
 * Dwell rides in the event payload ({ section, dwell_ms }); no schema column is
 * needed. Sub-second flushes are dropped as noise.
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
  const viewFired = useRef(false)
  // Dwell accumulation. `visibleSince` is the ms timestamp of the current
  // in-view span (null when out of view); `accumulated` sums prior spans.
  const visibleSince = useRef<number | null>(null)
  const accumulated = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const openSpan = () => {
      if (visibleSince.current == null) visibleSince.current = Date.now()
    }
    const closeSpan = () => {
      if (visibleSince.current != null) {
        accumulated.current += Date.now() - visibleSince.current
        visibleSince.current = null
      }
    }
    const flushDwell = () => {
      closeSpan()
      const ms = Math.round(accumulated.current)
      accumulated.current = 0
      if (ms >= 1000) trackProposalEvent(slug, 'section_dwell', { section, dwell_ms: ms })
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!viewFired.current) {
              viewFired.current = true
              trackProposalEvent(slug, 'section_view', { section })
            }
            openSpan()
          } else {
            // Left the viewport — bank the span and flush what we have.
            flushDwell()
          }
        }
      },
      { threshold: 0.4 },
    )
    obs.observe(el)

    // Pause/flush when the tab is backgrounded so idle time isn't counted.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushDwell()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      obs.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      flushDwell()
    }
  }, [slug, section])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
