import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guardrails for the prospect-facing proposal page.
 *
 * (Task 3) No affordability / formula mechanics may appear in the public UI.
 * (Trace amendment) No viability treatment of any kind on the public page — no green
 * affirmative, no badge, no floor-related rendering. Because there is NO floor-dependent
 * branch in the source, the public page necessarily renders identically for above-floor
 * and below-floor territories (only the scenario numbers differ). This scans the real
 * source on disk — the repo has no React DOM test harness, so this is the enforcement.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const PUBLIC_PAGE = 'src/app/proposals/[prospectId]/page.tsx'
const INTERNAL_PAGE = 'src/app/territories/[id]/page.tsx'

// Affordability / formula-derivation terms that must never reach a prospect.
// Word-boundary regexes so mechanic terms are caught (PTI8, PTI5) without false-positives
// on ordinary copy (e.g. "adoption" contains the substring "pti").
const FORBIDDEN_FORMULA: { name: string; re: RegExp }[] = [
  { name: 'PTI', re: /\bpti\d?\b/i },
  { name: '$37,415 income anchor', re: /37[,]?415/ },
  { name: '$59,865 robustness anchor', re: /59[,]?865/ },
  { name: 'credit', re: /\bcredit/i },
  { name: 'income-qualified', re: /income[ -]qualified/i },
  { name: 'prevalence', re: /\bprevalence/i },
  { name: 'affordability', re: /\baffordab/i },
  { name: 'FICO', re: /\bfico\b/i },
]

// Viability / floor treatment that the amendment bans from the public page.
const FORBIDDEN_VIABILITY = [
  'ViabilityBadge',
  'viabilityLevel',
  'meetsBaseFloor',
  'meetsFloor',
  'customersNeeded',
  'CUSTOMERS_NEEDED',
  'strong territory',
  'clears floor',
  'below floor',
]

describe('public proposal page — formula-exposure guardrail (Task 3)', () => {
  const src = read(PUBLIC_PAGE)
  for (const { name, re } of FORBIDDEN_FORMULA) {
    it(`does not expose ${name}`, () => {
      expect(src).not.toMatch(re)
    })
  }
})

describe('public proposal page — no viability treatment (amendment)', () => {
  const src = read(PUBLIC_PAGE)
  for (const term of FORBIDDEN_VIABILITY) {
    it(`does not render viability token "${term}"`, () => {
      expect(src).not.toContain(term)
    })
  }

  it('renders scenario cards with no internal prop (public variant)', () => {
    const src2 = read(PUBLIC_PAGE)
    expect(src2).toContain('<ScenarioCards sizing={sizing} />')
    // The internal variant is `internal` — must not appear on the public page.
    expect(src2).not.toMatch(/<ScenarioCards[^>]*\binternal\b/)
  })
})

describe('internal territory page — keeps the explicit indicator (Task 2)', () => {
  const src = read(INTERNAL_PAGE)
  it('imports and renders the ViabilityBadge', () => {
    expect(src).toContain('ViabilityBadge')
  })
  it('renders scenario cards in the internal variant', () => {
    expect(src).toMatch(/<ScenarioCards[^>]*\binternal\b/)
  })
})
