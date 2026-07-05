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
  title: 'Territory Development',
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

// ─────────────────────────────────────────────────────────────────────────────
// Session C PR-B static content (spec §6.7 / §6.8 / §6.11–§6.17).
//
// CONTENT-PENDING, approval-gated. Every string below is a template placeholder
// pending Trace + claims review. NO earnings/revenue figures, NO medical-efficacy
// claims, NO invented network count — those come only from Rick-Dahlson-cleared,
// CLAIMS_MATRIX-approved material (spec §10 ⚠; §6.12 is claims-gated). $179,000 is
// the exception: a non-negotiable Key Reference Value (CLAUDE.md), not a claim.
// ─────────────────────────────────────────────────────────────────────────────

export interface TitledBullet {
  title: string
  body: string
}

/**
 * §6.7 Practice Alignment — 4 fit bullets. Per spec §5 these are *variable*
 * (prospect.alignment_bullets); the per-prospect data model + generator wiring is
 * a Session D concern, so this is a template default for now (content-pending).
 */
export const ALIGNMENT_BULLETS: TitledBullet[] = [
  { title: 'Established practice', body: 'Alignment detail pending approval.' },
  { title: 'Aesthetic focus', body: 'Alignment detail pending approval.' },
  { title: 'Growth appetite', body: 'Alignment detail pending approval.' },
  { title: 'Team readiness', body: 'Alignment detail pending approval.' },
]

/** §6.8 The Platform — three capability pillars. Static template copy. */
export const PLATFORM_PILLARS: TitledBullet[] = [
  { title: 'Clinical', body: 'Platform detail pending approval.' },
  { title: 'Business', body: 'Platform detail pending approval.' },
  { title: 'Support', body: 'Platform detail pending approval.' },
]

/** §6.8 G.E.M.S. tiles — acronym tiles; captions content-pending. */
export const GEMS_TILES: { letter: string; caption: string }[] = [
  { letter: 'G', caption: 'Pending' },
  { letter: 'E', caption: 'Pending' },
  { letter: 'M', caption: 'Pending' },
  { letter: 'S', caption: 'Pending' },
]

/** §6.11 Training & Onboarding — "What this actually requires of you" (3 cards). */
export const WHAT_THIS_REQUIRES: TitledBullet[] = [
  { title: 'Your time', body: 'Commitment detail pending approval.' },
  { title: 'Your team', body: 'Commitment detail pending approval.' },
  { title: 'Your standards', body: 'Commitment detail pending approval.' },
]

/**
 * §6.12 Patient Results (claims-gated, spec §10 ⚠). Static shell only — NO
 * efficacy percentages or before/after claims until CLAIMS_MATRIX-cleared assets
 * exist. `stats` intentionally carries no numbers.
 */
export const PATIENT_RESULTS_NOTE =
  'Patient outcome content pending clinical/claims approval.'

/**
 * §6.13 National Network — the single sourced count (resolves the "80+" vs
 * "65+ active" inconsistency by rendering ONE value in both headline and body).
 * Null until Trace supplies the figure + source; the section renders a
 * number-free placeholder while null. Do NOT invent a number.
 */
export const NETWORK_LOCATION_COUNT: number | null = null

/** §6.14 Investment — standard territory price. Key Reference Value (CLAUDE.md). */
export const TERRITORY_STANDARD_PRICE = 179000

/** §6.14 included-items grid — non-financial inclusions. Content-pending labels. */
export const INVESTMENT_INCLUDED: string[] = [
  'Territory exclusivity',
  'Brand & marketing system',
  'Clinical protocols',
  'Training & onboarding',
  'Ongoing support',
  'Technology platform',
]

/** §6.15 Onboarding & Launch — 4 phases. Static template copy. */
export const LAUNCH_PHASES: { phase: string; title: string; body: string }[] = [
  { phase: '01', title: 'Sign & align', body: 'Phase detail pending approval.' },
  { phase: '02', title: 'Build & train', body: 'Phase detail pending approval.' },
  { phase: '03', title: 'Launch', body: 'Phase detail pending approval.' },
  { phase: '04', title: 'Grow', body: 'Phase detail pending approval.' },
]

/** §6.15 named support team. Content-pending placeholders (no real names invented). */
export const SUPPORT_TEAM: { name: string; role: string }[] = [
  { name: 'Support lead', role: 'Implementation' },
  { name: 'Support lead', role: 'Clinical' },
  { name: 'Support lead', role: 'Marketing' },
]

/** §6.16 Clinical Advisory Board — static grid. Content-pending placeholders. */
export const ADVISORY_BOARD: { name: string; credential: string }[] = [
  { name: 'Advisor', credential: 'Pending' },
  { name: 'Advisor', credential: 'Pending' },
  { name: 'Advisor', credential: 'Pending' },
  { name: 'Advisor', credential: 'Pending' },
]

/** §6.17 Common Questions — always expanded (no collapse). Content-pending FAQ. */
export const COMMON_QUESTIONS: { q: string; a: string }[] = [
  { q: 'How is my territory protected?', a: 'Answer pending approval.' },
  { q: 'What support do I get at launch?', a: 'Answer pending approval.' },
  { q: 'What does the platform include?', a: 'Answer pending approval.' },
  { q: 'How long until I launch?', a: 'Answer pending approval.' },
]

const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** "$179,000" — formatted standard territory price for display. */
export function formatTerritoryPrice(): string {
  return usdWhole.format(TERRITORY_STANDARD_PRICE)
}
