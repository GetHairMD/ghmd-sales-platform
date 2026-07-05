'use client'

import { useEffect, useRef } from 'react'
import { trackProposalEvent } from './analytics'

/**
 * Embedded Calendly scheduler for the Next Step section (spec §6.18).
 *
 * Fires calendly_open once when the widget mounts (spec §7). The booking itself
 * (calendly_booked) is recorded server-side by the verified Calendly webhook —
 * NOT from the browser — so this component deliberately does not emit a booked
 * event, avoiding an unverifiable/duplicated client signal.
 *
 * `calendlyUrl` is pre-built server-side (with the prospect utm_content already
 * appended) so no server-only crypto/helper is pulled into the client bundle.
 */
export default function CalendlyEmbed({
  slug,
  calendlyUrl,
}: {
  slug: string
  calendlyUrl: string | null
}) {
  const openFired = useRef(false)

  useEffect(() => {
    if (!calendlyUrl) return
    if (!document.getElementById('calendly-widget-js')) {
      const s = document.createElement('script')
      s.src = 'https://assets.calendly.com/assets/external/widget.js'
      s.id = 'calendly-widget-js'
      s.async = true
      document.body.appendChild(s)
    }
    if (!openFired.current) {
      openFired.current = true
      trackProposalEvent(slug, 'calendly_open', {})
    }
  }, [slug, calendlyUrl])

  if (!calendlyUrl) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center rounded-xl border border-text-inverse/15 text-sm text-text-inverse/50">
        Scheduling coming soon
      </div>
    )
  }

  return (
    <div
      className="calendly-inline-widget overflow-hidden rounded-xl bg-bg"
      data-url={calendlyUrl}
      style={{ minWidth: '280px', height: '660px' }}
      aria-label="Schedule a conversation"
    />
  )
}
