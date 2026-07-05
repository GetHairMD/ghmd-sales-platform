/**
 * POST /p/[slug]/access — access-code gate handler (Session B, brief §4).
 *
 * On a correct code: set the signed unlock cookie, log a proposal_sessions row
 * (device + referrer) and a session_start event, and return 200. On a wrong code
 * or unknown slug: 401 with no proposal data. Runs server-side with the
 * service-role client only.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import {
  PROPOSAL_COOKIE_NAME,
  PROPOSAL_COOKIE_MAX_AGE,
  signProposalCookie,
  verifyAccessCode,
} from '@/lib/proposal/gate'
import { getProposalGate, logProposalEvent, logProposalSession } from '@/lib/proposal/data'

export const dynamic = 'force-dynamic'

/** Coarse device bucket from the User-Agent — analytics only, never identifying. */
function deviceFromUA(ua: string | null): string {
  if (!ua) return 'unknown'
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile'
  if (/iPad|Tablet/i.test(ua)) return 'tablet'
  return 'desktop'
}

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const { slug } = params

  let code = ''
  try {
    const body = await request.json()
    code = typeof body?.code === 'string' ? body.code : ''
  } catch {
    // fall through to invalid
  }

  const invalid = () => NextResponse.json({ ok: false }, { status: 401 })
  if (!code.trim()) return invalid()

  const gate = await getProposalGate(slug)
  if (!gate) return invalid()
  if (!verifyAccessCode(code, gate.access_code_salt, gate.access_code_hash)) return invalid()

  // Correct code → unlock.
  const sid = randomUUID()
  const device = deviceFromUA(request.headers.get('user-agent'))
  const referrer = request.headers.get('referer')

  await logProposalSession({ prospectId: gate.prospect_id, device, referrer, sessionCookieId: sid })
  await logProposalEvent({ prospectId: gate.prospect_id, sessionCookieId: sid, eventType: 'session_start' })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(PROPOSAL_COOKIE_NAME, signProposalCookie(slug, gate.prospect_id, sid), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/p/${slug}`,
    maxAge: PROPOSAL_COOKIE_MAX_AGE,
  })
  return res
}
