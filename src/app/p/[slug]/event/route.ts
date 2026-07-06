/**
 * POST /p/[slug]/event — narrow analytics ingest (Session B, brief §3/§7).
 *
 * Accepts section_view and calculator_interaction events for an already-unlocked
 * proposal. The prospect + session id come from the verified signed cookie (never
 * trusted from the body), so events can't be spoofed to another proposal. Unknown
 * event types are rejected.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { PROPOSAL_COOKIE_NAME, verifyProposalCookie } from '@/lib/proposal/gate'
import { logProposalEvent } from '@/lib/proposal/data'
import { isClientProposalEvent, type ClientProposalEventType } from '@/lib/proposal/events'
import { isEmailConfigured, notifyTriggerFired } from '@/lib/notify/email'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// Accepts only client-emitted events (isClientProposalEvent). session_start is
// emitted server-side by the gate and calendly_booked only by the verified
// webhook — neither is accepted here.

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const unlock = verifyProposalCookie(request.cookies.get(PROPOSAL_COOKIE_NAME)?.value, params.slug)
  if (!unlock) return NextResponse.json({ ok: false }, { status: 401 })

  let type: unknown
  let payload: Record<string, unknown> | undefined
  try {
    const body = await request.json()
    type = body?.type
    payload = body?.payload && typeof body.payload === 'object' ? body.payload : undefined
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  if (!isClientProposalEvent(type)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await logProposalEvent({
    prospectId: unlock.prospectId,
    sessionCookieId: unlock.sid,
    eventType: type as ClientProposalEventType,
    payload,
  })

  // Hot-lead email v1 (spec §7): financing CTA click notifies the sales inbox.
  // Guard-closed until Resend is provisioned (isEmailConfigured) so no DB read or
  // send happens today; never blocks/breaks the ingest. (Dwell/session-count email
  // needs a fired-state table to avoid repeats — deferred; see PR notes.)
  if (type === 'financing_cta_click' && isEmailConfigured()) {
    try {
      const { data: p } = await createServiceClient()
        .from('prospects')
        .select('full_name')
        .eq('id', unlock.prospectId)
        .maybeSingle()
      await notifyTriggerFired({
        prospectId: unlock.prospectId,
        prospectName: (p?.full_name as string | undefined) ?? 'A prospect',
        triggerLabel: 'Clicked “See what you qualify for” (financing CTA)',
      })
    } catch (e) {
      console.error('[notify] financing-click notification failed:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
