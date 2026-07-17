import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { STAGE, stageLabel } from '../pipeline-stages'
import { computeMultiDealFeed, type MultiDealRow, type ResourceProspect } from '../dashboard/triggers'

/**
 * Multi-Deal UI guardrails (PR-B). Source-scan idiom (e0b twin) + pure-function
 * tests for the §8 dashboard feed:
 *   1. computeMultiDealFeed — role-scoping (rep-own / exec-all / null fail-closed),
 *      the Funded/Won-with-active-second-deal condition, and copy shape.
 *   2. The picker/panel write paths go ONLY through the governed RPCs — no direct
 *      deals write comes back in client code.
 *   3. The PR-B migration grants SELECT only (the 20260716260000 §12 write
 *      lockdown must survive this PR untouched).
 *   4. New components are token-clean (Hard Rule 8).
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/^\s*--.*$/gm, '')
}

const RAW_TAILWIND_COLOR =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|accent|caret|placeholder)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/

const ACTIONS = read('src/app/(app)/prospects/[id]/deal-actions.ts')
const PANEL = read('src/components/deals/DealHistoryPanel.tsx')
const PICKER = read('src/components/deals/TerritoryPickerDialog.tsx')

function grantMigration(): string {
  const dir = 'supabase/migrations'
  const hit = readdirSync(join(process.cwd(), dir)).find((f) =>
    f.endsWith('_multi_deal_ui_read_grants.sql'),
  )
  if (!hit) throw new Error('multi_deal_ui_read_grants migration not found')
  return read(`${dir}/${hit}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeMultiDealFeed
// ─────────────────────────────────────────────────────────────────────────────

const REP_A = 'rep-a'
const REP_B = 'rep-b'

const prospectById: Record<string, ResourceProspect> = {
  p1: { who: 'Dr. X · X Practice', assignedRepId: REP_A },
  p2: { who: 'Dr. Y', assignedRepId: REP_B },
}

const dealRow = (over: Partial<MultiDealRow> & { prospect_id: string }): MultiDealRow => ({
  stage: 1,
  deal_status: 'active',
  funded_won_at: null,
  territory_name: null,
  ...over,
})

/** Dr. X: deal#1 Funded/Won on Alpha, deal#2 active at Proposal Sent on Beta. */
const FIXTURE: MultiDealRow[] = [
  dealRow({
    prospect_id: 'p1',
    stage: STAGE.FUNDED_WON,
    territory_name: 'Territory Alpha',
    funded_won_at: '2026-07-16T00:00:00Z',
  }),
  dealRow({ prospect_id: 'p1', stage: STAGE.PROPOSAL_SENT, territory_name: 'Territory Beta' }),
]

const exec = { designation: 'executive' as const, userId: 'exec-1' }
const repA = { designation: 'rep' as const, userId: REP_A }
const repB = { designation: 'rep' as const, userId: REP_B }
const args = { prospectById, stageLabelFor: stageLabel, fundedWonStage: STAGE.FUNDED_WON }

describe('computeMultiDealFeed (§8)', () => {
  it('surfaces a Funded/Won customer’s active second deal, brief-shaped copy', () => {
    const items = computeMultiDealFeed({ deals: FIXTURE, viewer: exec, ...args })
    expect(items).toHaveLength(1)
    expect(items[0].category).toBe('DEAL')
    expect(items[0].who).toBe('Dr. X · X Practice')
    expect(items[0].action).toBe(
      '(Funded/Won — Territory Alpha) has an active deal on Territory Beta — Proposal Sent',
    )
  })

  it('rep sees only their OWN prospects’ items', () => {
    expect(computeMultiDealFeed({ deals: FIXTURE, viewer: repA, ...args })).toHaveLength(1)
    expect(computeMultiDealFeed({ deals: FIXTURE, viewer: repB, ...args })).toHaveLength(0)
  })

  it('null viewer fails closed', () => {
    const items = computeMultiDealFeed({
      deals: FIXTURE,
      viewer: { designation: null, userId: null },
      ...args,
    })
    expect(items).toHaveLength(0)
  })

  it('no item when the customer has not reached Funded/Won', () => {
    const deals = [
      dealRow({ prospect_id: 'p1', stage: STAGE.CONTRACT_SIGNED }),
      dealRow({ prospect_id: 'p1', stage: STAGE.PROPOSAL_SENT }),
    ]
    expect(computeMultiDealFeed({ deals, viewer: exec, ...args })).toHaveLength(0)
  })

  it('lost and stalled second deals do not surface (only active)', () => {
    const deals = [
      FIXTURE[0],
      dealRow({ prospect_id: 'p1', stage: STAGE.PROPOSAL_SENT, deal_status: 'stalled' }),
      dealRow({ prospect_id: 'p1', stage: STAGE.CONTACTED, deal_status: 'lost' }),
    ]
    expect(computeMultiDealFeed({ deals, viewer: exec, ...args })).toHaveLength(0)
  })

  it('one item PER active second deal (three-territory customer)', () => {
    const deals = [
      ...FIXTURE,
      dealRow({ prospect_id: 'p1', stage: STAGE.CONTACTED, territory_name: 'Territory Gamma' }),
    ]
    const items = computeMultiDealFeed({ deals, viewer: exec, ...args })
    expect(items).toHaveLength(2)
  })

  it('a single-deal Funded/Won customer yields nothing', () => {
    expect(computeMultiDealFeed({ deals: [FIXTURE[0]], viewer: exec, ...args })).toHaveLength(0)
  })

  it('unknown prospects are skipped (lost customers are absent from prospectById)', () => {
    const deals = [
      dealRow({ prospect_id: 'ghost', stage: STAGE.FUNDED_WON }),
      dealRow({ prospect_id: 'ghost', stage: STAGE.PROPOSAL_SENT }),
    ]
    expect(computeMultiDealFeed({ deals, viewer: exec, ...args })).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Write paths route ONLY through the governed RPCs
// ─────────────────────────────────────────────────────────────────────────────

describe('multi-deal UI — governed write paths only', () => {
  it('deal-actions calls the three governed RPCs', () => {
    expect(ACTIONS).toMatch(/\.rpc\('create_territory_deal'/)
    expect(ACTIONS).toMatch(/\.rpc\('move_deal_stage'/)
    expect(ACTIONS).toMatch(/\.rpc\('set_deal_status'/)
  })

  it('no client code writes deals directly (no .from(deals) insert/update/delete)', () => {
    for (const src of [ACTIONS, PANEL, PICKER]) {
      const code = codeOnly(src)
      expect(code).not.toMatch(/from\('deals'\)[\s\S]{0,200}?\.(insert|update|delete)\(/)
    }
  })

  it('the picker lists available territories only (draft/sold never offered)', () => {
    expect(ACTIONS).toMatch(/\.eq\('status',\s*'available'\)/)
  })

  it('the prequal soft-gate parity survives in moveDealStage (confirm + flag)', () => {
    expect(ACTIONS).toMatch(/requiresConfirm:\s*'prequal'/)
    expect(ACTIONS).toMatch(/skipped_funding_prequal:\s*true/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. PR-B migration is read-only
// ─────────────────────────────────────────────────────────────────────────────

describe('multi-deal UI — read-grant migration stays read-only', () => {
  it('grants SELECT on exactly the two new columns, nothing else', () => {
    const code = codeOnly(grantMigration())
    expect(code).toMatch(
      /grant select \(deal_status, funded_won_at\) on public\.deals to authenticated/i,
    )
    expect(code).not.toMatch(/grant\s+(insert|update|delete|all)/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Token cleanliness (Hard Rule 8)
// ─────────────────────────────────────────────────────────────────────────────

describe('multi-deal UI — token-clean components', () => {
  it.each([
    ['DealHistoryPanel', PANEL],
    ['TerritoryPickerDialog', PICKER],
  ])('%s uses design tokens, never raw Tailwind palette colors', (_name, src) => {
    expect(src).not.toMatch(RAW_TAILWIND_COLOR)
  })
})
