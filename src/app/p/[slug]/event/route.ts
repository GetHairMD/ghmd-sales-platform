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
import type { ProposalEventType } from '@/lib/proposal/types'

export const dynamic = 'force-dynamic'

// session_start is emitted server-side by the gate, not accepted from clients.
const CLIENT_EVENTS: ReadonlySet<ProposalEventType> = new Set<ProposalEventType>([
  'section_view',
  'calculator_interaction',
])

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

  if (typeof type !== 'string' || !CLIENT_EVENTS.has(type as ProposalEventType)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await logProposalEvent({
    prospectId: unlock.prospectId,
    sessionCookieId: unlock.sid,
    eventType: type as ProposalEventType,
    payload,
  })
  return NextResponse.json({ ok: true })
}
