import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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

// ─────────────────────────────────────────────────────────────────────────────
// Session B — /p/[slug] proposal system guardrails (brief §2; decision #68).
// Scans the whole gated-proposal render tree, not just one page.
// ─────────────────────────────────────────────────────────────────────────────

/** Recursively collect .ts/.tsx files under a repo-relative dir (skips stories). */
function collect(relDir: string, opts: { includeStories?: boolean } = {}): string[] {
  const abs = join(process.cwd(), relDir)
  if (!existsSync(abs)) return []
  const out: string[] = []
  for (const entry of readdirSync(abs)) {
    const rel = `${relDir}/${entry}`
    const full = join(process.cwd(), rel)
    if (statSync(full).isDirectory()) {
      out.push(...collect(rel, opts))
    } else if (/\.tsx?$/.test(entry)) {
      if (!opts.includeStories && /\.stories\.tsx?$/.test(entry)) continue
      out.push(rel)
    }
  }
  return out
}

const PROPOSAL_TREE = [
  ...collect('src/components/proposal'),
  ...collect('src/app/p'),
]
const PROPOSAL_PAGE = 'src/app/p/[slug]/page.tsx'
// Section-4 files carry the decision-#68 language ban (demographics ≠ demand-weighting).
const SECTION4_FILES = [
  'src/components/proposal/TerritoryAnalysis.tsx',
  'src/components/proposal/DemandTable.tsx',
  'src/components/proposal/TerritoryMap.tsx',
]
// Terms banned in Section 4 (no demand-weighting / propensity / qualification framing).
const SECTION4_FORBIDDEN = /propensity|conversion|weighted|weighting|more likely|qualif/i

describe('proposal /p tree — exists', () => {
  it('has render-tree files to scan', () => {
    expect(PROPOSAL_TREE.length).toBeGreaterThan(0)
  })
})

describe('proposal /p tree — no formula mechanics (brief §2.1)', () => {
  for (const file of PROPOSAL_TREE) {
    const src = read(file)
    for (const { name, re } of FORBIDDEN_FORMULA) {
      it(`${file} does not expose ${name}`, () => {
        expect(src).not.toMatch(re)
      })
    }
  }
})

describe('proposal /p tree — no viability semantics (brief §2.2)', () => {
  for (const file of PROPOSAL_TREE) {
    const src = read(file)
    for (const term of FORBIDDEN_VIABILITY) {
      it(`${file} has no viability token "${term}"`, () => {
        expect(src).not.toContain(term)
      })
    }
  }
})

describe('proposal Section 4 — demographics, not demand-weighting (decision #68)', () => {
  for (const file of SECTION4_FILES) {
    it(`${file} uses no propensity/conversion/weighting/qualification language`, () => {
      if (!existsSync(join(process.cwd(), file))) {
        throw new Error(`expected Section-4 file missing: ${file}`)
      }
      expect(read(file)).not.toMatch(SECTION4_FORBIDDEN)
    })
  }
})

describe('proposal /p tree — client bundle never imports formula constants (brief §2.1/§5.3)', () => {
  for (const file of PROPOSAL_TREE) {
    const src = read(file)
    if (!src.includes("'use client'")) continue
    it(`${file} (client) does not import formula/constants modules`, () => {
      expect(src).not.toMatch(/territory-sizing|addressable-market-constants|lib\/census/)
    })
  }
})

describe('proposal page — gate renders before any data fetch (brief §6, no pre-auth leak)', () => {
  const src = read(PROPOSAL_PAGE)
  it('returns the AccessCodeGate before fetching the proposal', () => {
    // Match usage sites (not imports): the gate is *rendered* before the data
    // fetch is *called*, guaranteeing no proposal data is fetched pre-auth.
    const gateAt = src.indexOf('<AccessCodeGate')
    const fetchAt = src.indexOf('await getProposalBySlug')
    expect(gateAt).toBeGreaterThan(-1)
    expect(fetchAt).toBeGreaterThan(-1)
    expect(gateAt).toBeLessThan(fetchAt)
  })
})

describe('scarcity banner — exact spec copy (spec §6 item 5)', () => {
  const file = 'src/components/proposal/ScarcityBanner.tsx'
  it('renders the exact scarcity sentence (with en-dash)', () => {
    const src = read(file)
    expect(src).toContain('Most physicians reach a decision within 2–3 conversations.')
    expect(src).toContain('we cannot hold it without a signed agreement.')
  })
})

describe('scarcity repeat at final CTA + brand line (spec §6.5 / §6.18)', () => {
  it('the shared helper produces the exact scarcity sentence', () => {
    const src = read('src/components/proposal/constants.ts')
    expect(src).toContain('Most physicians reach a decision within 2–3 conversations.')
    expect(src).toContain('we cannot hold it without a signed agreement.')
  })
  it('Next Step repeats the scarcity line via the shared helper', () => {
    const src = read('src/components/proposal/NextStep.tsx')
    expect(src).toContain('scarcitySentence(')
  })
  it('Next Step closes on the brand line token (KEEP • IMPROVE • GROW)', () => {
    const src = read('src/components/proposal/NextStep.tsx')
    expect(src).toContain('brand.line')
  })
})

describe('Session C instrumentation surface (spec §7)', () => {
  it('the client tracker never sends server- or webhook-only events', () => {
    // The analytics helper is typed to ClientProposalEventType; the ingest route
    // guards with isClientProposalEvent. Belt-and-braces: the route imports the guard.
    const route = read('src/app/p/[slug]/event/route.ts')
    expect(route).toContain('isClientProposalEvent')
  })
  it('the calendly webhook is guarded closed until the signing key is provisioned', () => {
    const route = read('src/app/api/calendly/webhook/route.ts')
    expect(route).toContain('isCalendlyWebhookConfigured')
    expect(route).toContain('503')
  })
})
