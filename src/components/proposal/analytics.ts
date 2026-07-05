'use client'

import type { ClientProposalEventType } from '@/lib/proposal/events'

/**
 * Fire-and-forget first-party analytics for /p/[slug] (spec §7).
 * Only client-emitted events are sendable here (section_view,
 * calculator_interaction, section_dwell, video_play, case_study_tab,
 * financing_cta_click, calendly_open, get_started_click); the server
 * re-validates the type against the unlock cookie. session_start is emitted
 * server-side and calendly_booked only via the verified webhook — neither is
 * sendable from the browser.
 */
export function trackProposalEvent(
  slug: string,
  type: ClientProposalEventType,
  payload?: Record<string, unknown>,
): void {
  try {
    void fetch(`/p/${slug}/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, payload }),
      keepalive: true,
    })
  } catch {
    // analytics is best-effort; never block the UI
  }
}
