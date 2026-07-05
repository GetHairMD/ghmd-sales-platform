/**
 * Calendly webhook + embed helpers for /p/[slug] (Session C, spec §6.18/§7).
 *
 * SERVER-ONLY. The booking-of-record signal (calendly_booked) is written only
 * from a Calendly webhook whose signature we verify here. As of this build the
 * signing key is NOT provisioned in Netlify (no CALENDLY_WEBHOOK_SIGNING_KEY),
 * so the webhook route is guarded closed — see isCalendlyWebhookConfigured().
 *
 * Signature scheme (Calendly v2): header
 *   Calendly-Webhook-Signature: t=<unix_seconds>,v1=<hex hmac-sha256>
 * where v1 = HMAC_SHA256(`${t}.${rawBody}`, signingKey).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const CALENDLY_SIGNING_KEY_ENV = 'CALENDLY_WEBHOOK_SIGNING_KEY'

/** The prospect id is round-tripped through the embed URL's utm_content param. */
export const CALENDLY_PROSPECT_UTM = 'utm_content'

/** True only when the webhook signing key is provisioned (non-empty). */
export function isCalendlyWebhookConfigured(): boolean {
  const key = process.env[CALENDLY_SIGNING_KEY_ENV]
  return typeof key === 'string' && key.length > 0
}

/** Parse a `t=...,v1=...` signature header into its parts. */
export function parseCalendlySignatureHeader(
  header: string | null | undefined,
): { t: string; v1: string } | null {
  if (!header) return null
  let t: string | undefined
  let v1: string | undefined
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2)
    if (k?.trim() === 't') t = v?.trim()
    else if (k?.trim() === 'v1') v1 = v?.trim()
  }
  if (!t || !v1) return null
  return { t, v1 }
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Verify a Calendly webhook signature against the raw request body.
 * Returns false on any malformed input rather than throwing.
 */
export function verifyCalendlySignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  signingKey: string,
): boolean {
  if (!signingKey) return false
  const parsed = parseCalendlySignatureHeader(signatureHeader)
  if (!parsed) return false
  const expected = createHmac('sha256', signingKey)
    .update(`${parsed.t}.${rawBody}`)
    .digest('hex')
  return safeEqualHex(parsed.v1, expected)
}

/** Minimal shape of the Calendly `invitee.created` payload we consume. */
export interface CalendlyInviteeCreated {
  prospectId: string | null
  scheduledEventUri: string | null
  inviteeUri: string | null
}

/**
 * Pull the prospect id (from utm_content) and event refs out of an
 * `invitee.created` webhook body. Returns nulls for anything absent so the
 * caller can decide whether the event is attributable.
 */
export function parseInviteeCreated(body: unknown): CalendlyInviteeCreated {
  const payload = (body as { payload?: Record<string, unknown> } | null)?.payload ?? {}
  const tracking = (payload.tracking as Record<string, unknown> | undefined) ?? {}
  const utmContent = tracking[CALENDLY_PROSPECT_UTM]
  return {
    prospectId: typeof utmContent === 'string' && utmContent.length > 0 ? utmContent : null,
    scheduledEventUri:
      typeof payload.scheduled_event === 'object' && payload.scheduled_event
        ? ((payload.scheduled_event as Record<string, unknown>).uri as string) ?? null
        : null,
    inviteeUri: typeof payload.uri === 'string' ? payload.uri : null,
  }
}

/**
 * Append the prospect-attribution utm_content param to a public Calendly
 * scheduling URL so the webhook can map a booking back to the prospect.
 */
export function withProspectTracking(schedulingUrl: string, prospectId: string): string {
  const sep = schedulingUrl.includes('?') ? '&' : '?'
  return `${schedulingUrl}${sep}${CALENDLY_PROSPECT_UTM}=${encodeURIComponent(prospectId)}`
}
