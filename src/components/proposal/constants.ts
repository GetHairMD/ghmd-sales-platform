/**
 * Static presentation constants for the gated proposal page (/p/[slug]).
 *
 * Static template constants (gethairmd.biz); copy pending Trace/claims review (spec §10).
 * These are category-level marketing figures, NOT per-prospect or formula-derived
 * values — presentational category figures only, independent of sizing logic.
 */

export interface StatStripItem {
  value: string
  label: string
}

/** Hero stat strip — four category-size proof points (spec §10). */
export const STAT_STRIP: StatStripItem[] = [
  { value: '$4.2B', label: 'Category size' },
  { value: '80M+', label: 'Affected in the U.S.' },
  { value: '400%', label: 'Category growth' },
  { value: '51%', label: 'Seek treatment' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Session C static content (spec §6.9 / §6.10 / §6.18).
//
// CONTENT-PENDING: copy, video ids, and the scheduling URL below are placeholders
// wired to named constants. They carry NO earnings/revenue figures — specific
// financial results are the §10 ⚠ earnings representations under active 506(b)
// and must come from Rick-Dahlson-cleared, CLAIMS_MATRIX-approved material only.
// Trace supplies the approved assets; these constants are the single insertion point.
// ─────────────────────────────────────────────────────────────────────────────

export interface CaseStudy {
  key: string
  label: string
  headline: string
  /** Qualitative, approval-pending. No earnings figures (spec §10 ⚠). */
  body: string
}

/** §6.9 Proven Results — three case-study tabs. Static, approval-pending copy. */
export const CASE_STUDIES: CaseStudy[] = [
  {
    key: 'deschutes',
    label: 'Deschutes',
    headline: 'Deschutes',
    body: 'Case study content pending approval. Approved narrative to be supplied from cleared material.',
  },
  {
    key: 'lux',
    label: 'LUX',
    headline: 'LUX',
    body: 'Case study content pending approval. Approved narrative to be supplied from cleared material.',
  },
  {
    key: 'sand',
    label: 'Sand',
    headline: 'Sand',
    body: 'Case study content pending approval. Approved narrative to be supplied from cleared material.',
  },
]

export interface PhysicianVoice {
  /** Wistia hashed media id. Empty string until Trace provisions the video. */
  mediaId: string
  name: string
  title: string
}

/** §6.10 Physician Voices — Wistia embeds. Media ids pending provisioning. */
export const PHYSICIAN_VOICES: PhysicianVoice[] = [
  { mediaId: '', name: 'Physician testimonial', title: 'Video coming soon' },
  { mediaId: '', name: 'Physician testimonial', title: 'Video coming soon' },
]

/**
 * §6.18 embedded Calendly scheduling URL (public — no secret). Null until Trace
 * provisions it; the embed renders a "Scheduling coming soon" placeholder while null.
 */
export const CALENDLY_SCHEDULING_URL: string | null = null

export interface RepCard {
  name: string
  title: string
  blurb: string
}

/** §6.18 Next Step — the representative's card. Content-pending. */
export const NEXT_STEP_REP: RepCard = {
  name: 'Trace',
  title: 'Franchise Development',
  blurb: 'Your point of contact for this territory. Reach out with any questions.',
}

/** Exact scarcity sentence (spec §6.5). Repeated in small text at the final CTA. */
export function scarcitySentence(territoryName: string | null): string {
  const territory = territoryName?.trim() || 'chosen'
  return `Most physicians reach a decision within 2–3 conversations. Your ${territory} territory is currently available — we cannot hold it without a signed agreement.`
}

const HONORIFICS = new Set(['dr', 'dr.', 'mr', 'mr.', 'ms', 'ms.', 'mrs', 'mrs.', 'prof', 'prof.'])

/**
 * Best-effort "{prospect_first_display}" (spec §5) derived from prospect_name_full,
 * since it isn't stored separately. "Dr. Amelia K. Hausauer, MD" → "Dr. Hausauer";
 * "Amelia Hausauer" → "Amelia". Falls back to "there" when unavailable.
 */
export function deriveProspectFirstDisplay(fullName: string | null): string {
  const cleaned = fullName?.split(',')[0]?.trim()
  if (!cleaned) return 'there'
  const tokens = cleaned.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 'there'
  if (HONORIFICS.has(tokens[0].toLowerCase())) {
    const last = tokens[tokens.length - 1]
    return tokens.length >= 2 ? `${tokens[0]} ${last}` : tokens[0]
  }
  return tokens[0]
}
