/**
 * Proposal generator — pure helpers (Session D / D3, spec §11).
 *
 * Slug/salutation derivation + ready-to-send outreach copy. Pure and isomorphic
 * (unit-tested). Randomness (slug suffix, access code) is generated server-side in
 * generate.ts and passed in, so these stay deterministic.
 *
 * OUTPUTS-ONLY (Hard Rule 1): the copy contains the prospect's link + access code
 * and approved template language only — NO addressable/territory numbers, NO
 * revenue/earnings figures, NO formula mechanics. The scarcity line is the approved
 * template copy from spec §5. All generated copy is PLACEHOLDER-APPROVED and must
 * clear Trace/claims review before any real send (flagged to Chat).
 */

/** Lowercase, strip to alphanumerics, hyphenate — for the public slug. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop combining diacritics so é → e
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/** Unguessable public slug: name stem + a random suffix (suffix from crypto). */
export function buildProposalSlug(name: string, suffix: string): string {
  const stem = slugifyName(name) || 'proposal'
  return `${stem}-${suffix}`
}

/**
 * A brief salutation for outreach — "Dr. Elena Petrov" → "Dr. Petrov";
 * "Elena Petrov" → "Elena". Falls back to the whole string when unsure.
 */
export function salutationFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 0 || parts[0] === '') return 'there'
  if (/^dr\.?$/i.test(parts[0]) && parts.length >= 2) {
    return `Dr. ${parts[parts.length - 1]}`
  }
  return parts[0]
}

export interface OutreachCopyInput {
  salutation: string
  practiceName: string | null
  territoryName: string | null
  url: string
  accessCode: string
  /** Sender display name for the sign-off (approved template default). */
  senderName?: string
}

export interface OutreachCopy {
  emailSubject: string
  emailBody: string
  sms: string
}

/**
 * Ready-to-send email + SMS copy. Template placeholder language only — approval
 * required before real use. Contains no numeric territory/revenue outputs.
 */
export function buildOutreachCopy(input: OutreachCopyInput): OutreachCopy {
  const { salutation, practiceName, territoryName, url, accessCode } = input
  const sender = input.senderName ?? 'Trace'
  const territory = territoryName ?? 'your territory'
  const practiceClause = practiceName ? ` for ${practiceName}` : ''

  const emailSubject = `Your ${territory} territory analysis — GetHairMD`

  const emailBody = [
    `Hi ${salutation},`,
    '',
    `I've prepared a private territory analysis${practiceClause} covering ${territory}. You can view it here:`,
    '',
    url,
    `Access code: ${accessCode}`,
    '',
    `Most physicians reach a decision within 2–3 conversations, and the ${territory} territory is currently available. Happy to walk you through it whenever works.`,
    '',
    `— ${sender}, GetHairMD`,
  ].join('\n')

  const sms = `Hi ${salutation}, your ${territory} territory analysis is ready: ${url} (access code ${accessCode}) — ${sender}, GetHairMD`

  return { emailSubject, emailBody, sms }
}
