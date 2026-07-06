/**
 * Transactional email (Session D / D2 email v1, spec §7).
 *
 * SERVER-ONLY. Provider is Resend (Trace-selected). We call the Resend REST API
 * with `fetch` — no npm dependency added. The API key + verified sender are
 * Netlify secrets provisioned by TRACE off-transcript (same secret-handling rule
 * as the Calendly signing key — Coder never sets or reads the key):
 *   • RESEND_API_KEY   — server-only secret
 *   • RESEND_FROM      — verified sender, e.g. "GetHairMD <notify@…>"
 *   • RESEND_NOTIFY_TO — rep/sales inbox that trigger alerts go to (v1: single
 *                        inbox; per-rep routing needs a rep→email map — deferred)
 *
 * Until all three are set, isEmailConfigured() is false and every send is a
 * logged no-op — never a throw, never a fabricated key (mirrors the Calendly
 * blocked-pending-provisioning guard).
 */

export const RESEND_API_KEY_ENV = 'RESEND_API_KEY'
export const RESEND_FROM_ENV = 'RESEND_FROM'
export const RESEND_NOTIFY_TO_ENV = 'RESEND_NOTIFY_TO'

function env(name: string): string | undefined {
  const v = process.env[name]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** True only when the key, sender, and notify inbox are all provisioned. */
export function isEmailConfigured(): boolean {
  return Boolean(env(RESEND_API_KEY_ENV) && env(RESEND_FROM_ENV) && env(RESEND_NOTIFY_TO_ENV))
}

export interface EmailSendResult {
  sent: boolean
  reason?: string
  id?: string
}

/** Low-level send. Returns a result rather than throwing so callers can fire-and-forget. */
export async function sendEmail(input: {
  to: string
  subject: string
  text: string
}): Promise<EmailSendResult> {
  const apiKey = env(RESEND_API_KEY_ENV)
  const from = env(RESEND_FROM_ENV)
  if (!apiKey || !from) {
    console.warn('[notify] RESEND not provisioned — skipping email (blocked-pending-provisioning).')
    return { sent: false, reason: 'not_provisioned' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, text: input.text }),
    })
    if (!res.ok) {
      console.error(`[notify] Resend send failed: ${res.status}`)
      return { sent: false, reason: `resend_${res.status}` }
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null
    return { sent: true, id: data?.id }
  } catch (e) {
    console.error(`[notify] Resend send error: ${e instanceof Error ? e.message : String(e)}`)
    return { sent: false, reason: 'fetch_error' }
  }
}

/**
 * Notify the sales inbox that a hot-lead trigger fired for a prospect (spec §7).
 * Fire-and-forget: guard-closed and errors never surface to the request path.
 * The email carries the prospect name + a link into the Deal Room — no formula
 * mechanics (Hard Rule 1).
 */
export async function notifyTriggerFired(input: {
  prospectId: string
  prospectName: string
  triggerLabel: string
  baseUrl?: string
}): Promise<EmailSendResult> {
  const to = env(RESEND_NOTIFY_TO_ENV)
  if (!to) {
    console.warn('[notify] RESEND_NOTIFY_TO not set — skipping trigger notification.')
    return { sent: false, reason: 'not_provisioned' }
  }
  const base = input.baseUrl ?? env('NEXT_PUBLIC_APP_BASE_URL') ?? 'https://ghmdsalesplatform.netlify.app'
  const link = `${base}/prospects/${input.prospectId}`
  return sendEmail({
    to,
    subject: `Hot lead: ${input.prospectName} — ${input.triggerLabel}`,
    text: [
      `${input.prospectName} just triggered a hot-lead signal on their proposal:`,
      '',
      input.triggerLabel,
      '',
      `Open the Deal Room: ${link}`,
    ].join('\n'),
  })
}
