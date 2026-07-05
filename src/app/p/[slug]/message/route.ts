/**
 * POST /p/[slug]/message — Next Step message-form ingest (spec §6.18).
 *
 * Secondary action to the embedded Calendly. Records the prospect's message as
 * an activity note on their timeline (rep-visible). The prospect id comes from
 * the verified unlock cookie, never the body, so a message can't be posted to
 * another prospect. Not a proposal_events type (not in §7's list).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { PROPOSAL_COOKIE_NAME, verifyProposalCookie } from '@/lib/proposal/gate'
import { logProposalMessage } from '@/lib/proposal/data'

export const dynamic = 'force-dynamic'

const MAX_MESSAGE_LEN = 2000

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const unlock = verifyProposalCookie(request.cookies.get(PROPOSAL_COOKIE_NAME)?.value, params.slug)
  if (!unlock) return NextResponse.json({ ok: false }, { status: 401 })

  let message: unknown
  try {
    message = (await request.json())?.message
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  if (typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await logProposalMessage({
    prospectId: unlock.prospectId,
    message: message.trim().slice(0, MAX_MESSAGE_LEN),
  })
  return NextResponse.json({ ok: true })
}
