/**
 * POST /api/calendly/webhook — Calendly booking ingest (Session C, spec §7).
 *
 * Writes calendly_booked (invitee.created) and calendly_canceled
 * (invitee.canceled) when a prospect books or cancels through the embedded
 * Calendly on their proposal (spec §6.18). Both event types from the live
 * subscription are acknowledged with 2xx. The prospect is resolved from the
 * utm_content the embed round-trips (see lib/proposal/calendly.ts).
 *
 * ⚠ BLOCKED-PENDING-PROVISIONING: the Calendly webhook signing secret
 * (CALENDLY_WEBHOOK_SIGNING_KEY) is not yet set in Netlify. Until it is, this
 * endpoint refuses all requests with 503 — it never trusts an unsigned body and
 * never fabricates a secret. Once the secret is provisioned the guard opens with
 * no code change. Reported to Chat for the decision-log/provisioning note.
 */
import { NextResponse, type NextRequest } from 'next/server'
import {
  CALENDLY_SIGNING_KEY_ENV,
  isCalendlyWebhookConfigured,
  parseInviteeCreated,
  verifyCalendlySignature,
} from '@/lib/proposal/calendly'
import { logProposalEvent } from '@/lib/proposal/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Guard closed until the signing key is provisioned. Explicit, logged, no silent pass.
  if (!isCalendlyWebhookConfigured()) {
    console.warn(
      `[calendly] webhook received but ${CALENDLY_SIGNING_KEY_ENV} is not set — refusing (blocked-pending-provisioning).`,
    )
    return NextResponse.json(
      { ok: false, reason: 'calendly_webhook_not_provisioned' },
      { status: 503 },
    )
  }

  const signingKey = process.env[CALENDLY_SIGNING_KEY_ENV] as string
  const rawBody = await request.text()
  const signature = request.headers.get('Calendly-Webhook-Signature')

  if (!verifyCalendlySignature(rawBody, signature, signingKey)) {
    console.warn('[calendly] webhook signature verification failed — rejecting.')
    return NextResponse.json({ ok: false, reason: 'bad_signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad_json' }, { status: 400 })
  }

  const event = (body as { event?: string } | null)?.event
  // Map the two subscribed event types to their proposal_events counterparts.
  const eventType =
    event === 'invitee.created'
      ? 'calendly_booked'
      : event === 'invitee.canceled'
        ? 'calendly_canceled'
        : null
  if (!eventType) {
    // Acknowledge any other event without recording (2xx).
    return NextResponse.json({ ok: true, ignored: event ?? null })
  }

  const { prospectId, scheduledEventUri, inviteeUri } = parseInviteeCreated(body)
  if (!prospectId) {
    // Not attributable to a proposal prospect — acknowledge (2xx), don't record.
    console.warn(`[calendly] ${event} without a prospect utm_content — not recording.`)
    return NextResponse.json({ ok: true, unattributed: true })
  }

  await logProposalEvent({
    prospectId,
    sessionCookieId: null,
    eventType,
    payload: { scheduledEventUri, inviteeUri },
  })

  return NextResponse.json({ ok: true })
}
