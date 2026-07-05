'use client'

import type { ProposalEventType } from '@/lib/proposal/types'

/**
 * Fire-and-forget first-party analytics for /p/[slug] (Session B, brief §7).
 * Only the narrow client-side events are sendable here (section_view,
 * calculator_interaction); the server validates against the unlock cookie.
 */
export function trackProposalEvent(
  slug: string,
  type: Extract<ProposalEventType, 'section_view' | 'calculator_interaction'>,
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
