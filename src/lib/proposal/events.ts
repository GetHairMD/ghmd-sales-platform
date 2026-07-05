/**
 * Proposal event taxonomy — single source of truth (Session C, spec §7).
 *
 * Isomorphic (no 'use client', no server-only imports) so the client analytics
 * helper, the server ingest route, and the Vitest cross-check against the
 * database CHECK constraint all read the SAME lists. Adding an event type here
 * and to the migration CHECK is the only place the taxonomy is defined.
 *
 * Three emit paths, mutually exclusive:
 *   • SERVER  — written server-side by the gate/render (never accepted from a client).
 *   • CLIENT  — sent by the browser via POST /p/[slug]/event (cookie-verified).
 *   • WEBHOOK — written server-side by a verified third-party webhook only.
 */

/** Emitted server-side at gate pass / render. Never accepted from the browser. */
export const SERVER_EVENT_TYPES = ['session_start'] as const

/**
 * Emitted by the browser through the cookie-gated /event route.
 * section_view + calculator_interaction shipped in Session B; the rest are
 * Session C (spec §6.6/§6.9/§6.10/§6.18/§6.19 + dwell).
 */
export const CLIENT_EVENT_TYPES = [
  'section_view',
  'calculator_interaction',
  'section_dwell',
  'video_play',
  'case_study_tab',
  'financing_cta_click',
  'calendly_open',
  'get_started_click',
] as const

/**
 * Written server-side by a verified third-party webhook only (never the browser,
 * never the render). calendly_booked is the booking-of-record signal (authoritative
 * over any client-side calendly_open); calendly_canceled records an
 * invitee.canceled from the same subscription.
 */
export const WEBHOOK_EVENT_TYPES = ['calendly_booked', 'calendly_canceled'] as const

/** Every valid event_type — must exactly match the migration CHECK constraint. */
export const ALL_PROPOSAL_EVENT_TYPES = [
  ...SERVER_EVENT_TYPES,
  ...CLIENT_EVENT_TYPES,
  ...WEBHOOK_EVENT_TYPES,
] as const

export type ProposalEventType = (typeof ALL_PROPOSAL_EVENT_TYPES)[number]
export type ServerProposalEventType = (typeof SERVER_EVENT_TYPES)[number]
export type ClientProposalEventType = (typeof CLIENT_EVENT_TYPES)[number]
export type WebhookProposalEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

/** Runtime membership set for the ingest route (client-acceptable events only). */
export const CLIENT_EVENT_SET: ReadonlySet<ProposalEventType> = new Set(CLIENT_EVENT_TYPES)

export function isClientProposalEvent(value: unknown): value is ClientProposalEventType {
  return typeof value === 'string' && CLIENT_EVENT_SET.has(value as ProposalEventType)
}
