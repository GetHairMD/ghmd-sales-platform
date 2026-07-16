import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { NAV_ITEMS, BOTTOM_TABS } from '../../components/shell/nav-items'
import { TERRITORY_STANDARD_PRICE } from '../../components/proposal/constants'
import { STAGE, FUNDING_PREQUAL_GATE_STAGE } from '../pipeline-stages'
import {
  DISCOUNT_REASONS,
  computeRepCommandCenterMetrics,
  computeSpeedToLead,
  repDisplayName,
  type ProspectMetricRow,
  type RepCommandCenterInputs,
} from '../rep-command-center/metrics'

/**
 * §4D Rep Command Center guardrails (decision #169). Repo idiom, two layers:
 *   • pure-function unit tests for the per-rep metric derivations (gross/net,
 *     discount economics, the TWO closing-rate variants, cycle time, health mix,
 *     prequal skip rate, speed-to-lead proxy, score delta, $/addressable);
 *   • source-scan invariants for the things a unit test can't execute — the
 *     migration's grant/trigger/CHECK discipline, and the CONCEALMENT boundary
 *     (nothing about this route may ship in client-bundled modules; the page must
 *     404 — never 403/redirect — for non-executives). Comment-stripped so ABSENCE
 *     checks can't be fooled by prose.
 *
 * NOTE: concealed-nav.ts is `import 'server-only'` — importing it here (a node
 * test) would throw by design. Its invariants are pinned by source-scan instead.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sqlCodeOnly(src: string): string {
  return src.replace(/--.*$/gm, '')
}

function migrationPath(): string {
  const dir = 'supabase/migrations'
  const hit = readdirSync(join(process.cwd(), dir)).find((f) =>
    f.endsWith('_4d_discount_governance.sql'),
  )
  if (!hit) throw new Error('4d_discount_governance migration not found')
  return `${dir}/${hit}`
}

const PAGE = 'src/app/(app)/rep-command-center/page.tsx'
const VIEW = 'src/components/rep-command-center/RepCommandCenterView.tsx'
const CONCEALED_NAV = 'src/components/shell/concealed-nav.ts'
const SIDEBAR = 'src/components/shell/Sidebar.tsx'
const APP_SHELL = 'src/components/shell/AppShell.tsx'
const METRICS = 'src/lib/rep-command-center/metrics.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const REP_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const REP_B = 'aaaaaaaa-0000-0000-0000-000000000002'
const EXEC = 'eeeeeeee-0000-0000-0000-000000000001'
const NOW = Date.parse('2026-07-16T00:00:00Z')

function prospect(overrides: Partial<ProspectMetricRow> & { id: string }): ProspectMetricRow {
  return {
    assigned_rep_id: REP_A,
    created_at: '2026-06-01T00:00:00Z',
    funded_won_at: null,
    stage: STAGE.NEW_LEAD,
    deal_status: 'active',
    skipped_funding_prequal: false,
    full_name: 'Dr. Fixture',
    practice_name: null,
    ...overrides,
  }
}

function baseInputs(): RepCommandCenterInputs {
  return {
    reps: [
      { user_id: REP_A, full_name: 'QA Rep A', created_at: '2026-06-16T00:00:00Z' },
      { user_id: REP_B, full_name: null, created_at: '2026-07-06T00:00:00Z' },
    ],
    prospects: [],
    deals: [],
    territories: [],
    proposalEvents: [],
    resourceShares: [],
    resourceOpens: [],
    selfScores: [],
    execGrades: [],
    outreachTouches: [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric derivations
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRepCommandCenterMetrics', () => {
  it('returns a row per rep with zeroed metrics on an empty book', () => {
    const [a, b] = computeRepCommandCenterMetrics(baseInputs(), NOW)
    expect(a.repId).toBe(REP_A)
    expect(a.assignedCount).toBe(0)
    expect(a.closedCount).toBe(0)
    expect(a.grossRevenue).toBe(0)
    expect(a.netRevenue).toBe(0)
    expect(a.closingRateOverallPct).toBeNull()
    expect(a.closingRateQualifiedPct).toBeNull()
    expect(a.discountFrequencyPct).toBeNull()
    expect(a.avgCycleDays).toBeNull()
    expect(a.scoreDelta).toBeNull()
    expect(b.deals).toEqual([])
  })

  it('falls back to a generic label on NULL full_name (Rep Provisioning rule) — never "null"', () => {
    const [, b] = computeRepCommandCenterMetrics(baseInputs(), NOW)
    expect(b.name).toBe('Unnamed rep')
    expect(repDisplayName(null)).toBe('Unnamed rep')
    expect(repDisplayName('  ')).toBe('Unnamed rep')
    expect(repDisplayName('QA Rep B')).toBe('QA Rep B')
  })

  it('tenure comes from internal_users.created_at (start-date proxy)', () => {
    const [a, b] = computeRepCommandCenterMetrics(baseInputs(), NOW)
    expect(a.tenureDays).toBe(30)
    expect(b.tenureDays).toBe(10)
  })

  it('gross = closes × the single-source $179,000 list; net = actual deal prices', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({ id: 'p1', funded_won_at: '2026-07-01T00:00:00Z', stage: STAGE.FUNDED_WON }),
      prospect({ id: 'p2', funded_won_at: '2026-07-10T00:00:00Z', stage: STAGE.FUNDED_WON }),
      prospect({ id: 'p3' }),
    ]
    inputs.deals = [
      // p1 discounted; p2 at list
      { id: 'd1', prospect_id: 'p1', territory_id: null, territory_price: 150000, discount_reason: 'strategic_deal', created_at: '2026-06-20T00:00:00Z' },
      { id: 'd2', prospect_id: 'p2', territory_id: null, territory_price: 179000, discount_reason: null, created_at: '2026-06-20T00:00:00Z' },
    ]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.closedCount).toBe(2)
    expect(a.grossRevenue).toBe(2 * TERRITORY_STANDARD_PRICE)
    expect(a.netRevenue).toBe(150000 + 179000)
    expect(a.discountedCount).toBe(1)
    expect(a.discountFrequencyPct).toBe(50)
    expect(a.discountByReason.strategic_deal).toBe(1)
    expect(a.discountByReason.other).toBe(0)
  })

  it('a closed prospect with NO deals row keeps the total complete but flags the price as a DATA GAP, not a confirmed close', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({ id: 'p1', funded_won_at: '2026-07-01T00:00:00Z', stage: STAGE.FUNDED_WON }),
    ]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    // Total stays complete — we do NOT silently drop the dollars…
    expect(a.netRevenue).toBe(TERRITORY_STANDARD_PRICE)
    // …but the assumed price is surfaced as unconfirmed, never a real discount.
    expect(a.discountedCount).toBe(0)
    expect(a.deals[0].price).toBe(TERRITORY_STANDARD_PRICE)
    expect(a.deals[0].priceConfirmed).toBe(false)
    expect(a.dataGapCount).toBe(1)
    expect(a.dataGapRevenue).toBe(TERRITORY_STANDARD_PRICE)
    // An assumed price yields no confirmed $/addressable sample either.
    expect(a.avgPricePerAddressable).toBeNull()
  })

  it('a deal row with a NULL territory_price is ALSO a data gap (not a confirmed $179k close)', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({ id: 'p1', funded_won_at: '2026-07-01T00:00:00Z', stage: STAGE.FUNDED_WON }),
    ]
    inputs.deals = [
      { id: 'd1', prospect_id: 'p1', territory_id: null, territory_price: null, discount_reason: null, created_at: '2026-06-20T00:00:00Z' },
    ]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.netRevenue).toBe(TERRITORY_STANDARD_PRICE)
    expect(a.deals[0].priceConfirmed).toBe(false)
    expect(a.deals[0].discounted).toBe(false)
    expect(a.dataGapCount).toBe(1)
    expect(a.dataGapRevenue).toBe(TERRITORY_STANDARD_PRICE)
  })

  it('a deal with a real non-null territory_price (at list OR discounted) is CONFIRMED and contributes zero data gap', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({ id: 'p1', funded_won_at: '2026-07-01T00:00:00Z', stage: STAGE.FUNDED_WON }),
      prospect({ id: 'p2', funded_won_at: '2026-07-02T00:00:00Z', stage: STAGE.FUNDED_WON }),
    ]
    inputs.deals = [
      // at list
      { id: 'd1', prospect_id: 'p1', territory_id: null, territory_price: 179000, discount_reason: null, created_at: '2026-06-20T00:00:00Z' },
      // discounted
      { id: 'd2', prospect_id: 'p2', territory_id: null, territory_price: 150000, discount_reason: 'strategic_deal', created_at: '2026-06-20T00:00:00Z' },
    ]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    const byId = Object.fromEntries(a.deals.map((d) => [d.dealId, d]))
    expect(byId.d1.priceConfirmed).toBe(true)
    expect(byId.d2.priceConfirmed).toBe(true)
    expect(a.dataGapCount).toBe(0)
    expect(a.dataGapRevenue).toBe(0)
    expect(a.netRevenue).toBe(179000 + 150000)
  })

  it('uses the MOST RECENT deal per prospect (latest created_at wins)', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({ id: 'p1', funded_won_at: '2026-07-01T00:00:00Z', stage: STAGE.FUNDED_WON }),
    ]
    inputs.deals = [
      { id: 'd-old', prospect_id: 'p1', territory_id: null, territory_price: 179000, discount_reason: null, created_at: '2026-06-01T00:00:00Z' },
      { id: 'd-new', prospect_id: 'p1', territory_id: null, territory_price: 160000, discount_reason: 'speed_to_close', created_at: '2026-06-25T00:00:00Z' },
    ]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.netRevenue).toBe(160000)
    expect(a.deals[0].dealId).toBe('d-new')
    expect(a.deals[0].discountReason).toBe('speed_to_close')
  })

  it('computes BOTH closing-rate variants — overall and stage-qualified — as different figures', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      // 4 assigned; 2 reached Proposal Sent+; 1 closed
      prospect({ id: 'p1', funded_won_at: '2026-07-01T00:00:00Z', stage: STAGE.FUNDED_WON }),
      prospect({ id: 'p2', stage: STAGE.PROPOSAL_SENT }),
      prospect({ id: 'p3', stage: STAGE.CONTACTED }),
      prospect({ id: 'p4', stage: STAGE.NEW_LEAD }),
    ]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.closingRateOverallPct).toBe(25) // 1 of 4 assigned
    expect(a.reachedProposalCount).toBe(2) // p1 (closed) + p2 (at Proposal Sent)
    expect(a.closingRateQualifiedPct).toBe(50) // 1 of 2 qualified
  })

  it('a closed prospect counts as having reached Proposal Sent even if stage were to move back', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({ id: 'p1', funded_won_at: '2026-07-01T00:00:00Z', stage: STAGE.CONTACTED }),
    ]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.reachedProposalCount).toBe(1)
    expect(a.closingRateQualifiedPct).toBe(100)
  })

  it('average deal-cycle time runs prospects.created_at → funded_won_at', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({
        id: 'p1',
        created_at: '2026-06-01T00:00:00Z',
        funded_won_at: '2026-06-11T00:00:00Z', // 10 days
        stage: STAGE.FUNDED_WON,
      }),
      prospect({
        id: 'p2',
        created_at: '2026-06-01T00:00:00Z',
        funded_won_at: '2026-06-21T00:00:00Z', // 20 days
        stage: STAGE.FUNDED_WON,
      }),
    ]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.avgCycleDays).toBe(15)
  })

  it('deal-health mix counts prospects.deal_status per rep', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({ id: 'p1', deal_status: 'active' }),
      prospect({ id: 'p2', deal_status: 'stalled' }),
      prospect({ id: 'p3', deal_status: 'lost' }),
      prospect({ id: 'p4', deal_status: 'active' }),
      prospect({ id: 'p5', deal_status: 'active', assigned_rep_id: REP_B }),
    ]
    const [a, b] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.dealHealth).toEqual({ active: 2, stalled: 1, lost: 1 })
    expect(b.dealHealth).toEqual({ active: 1, stalled: 0, lost: 0 })
  })

  it('a close is a durable fact: funded_won_at counts even when deal_status is lost', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({
        id: 'p1',
        funded_won_at: '2026-07-01T00:00:00Z',
        stage: STAGE.FUNDED_WON,
        deal_status: 'lost',
      }),
    ]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.closedCount).toBe(1)
    expect(a.grossRevenue).toBe(TERRITORY_STANDARD_PRICE)
  })

  it('prequal skip rate: skipped ÷ prospects at/past the funding gate stage', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({ id: 'p1', stage: FUNDING_PREQUAL_GATE_STAGE, skipped_funding_prequal: true }),
      prospect({ id: 'p2', stage: FUNDING_PREQUAL_GATE_STAGE + 1, skipped_funding_prequal: false }),
      // Below the gate: skipping was not yet possible — excluded from the denominator.
      prospect({ id: 'p3', stage: STAGE.PROPOSAL_SENT, skipped_funding_prequal: false }),
    ]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.prequalGateCount).toBe(2)
    expect(a.prequalSkippedCount).toBe(1)
    expect(a.prequalSkipRatePct).toBe(50)
  })

  it('engagement: proposal events via assigned prospects; E-3 shares/opens via server-stamped rep_id', () => {
    const inputs = baseInputs()
    inputs.prospects = [prospect({ id: 'p1' }), prospect({ id: 'p2', assigned_rep_id: REP_B })]
    inputs.proposalEvents = [
      { prospect_id: 'p1' },
      { prospect_id: 'p1' },
      { prospect_id: 'p2' },
      { prospect_id: 'unassigned-prospect' },
    ]
    inputs.resourceShares = [
      { id: 's1', rep_id: REP_A },
      { id: 's2', rep_id: REP_A },
      { id: 's3', rep_id: REP_B },
    ]
    inputs.resourceOpens = [{ share_id: 's1' }, { share_id: 's1' }, { share_id: 's3' }]
    const [a, b] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.proposalEventCount).toBe(2)
    expect(b.proposalEventCount).toBe(1)
    expect(a.resourceShareCount).toBe(2)
    expect(a.resourceOpenCount).toBe(2)
    expect(b.resourceShareCount).toBe(1)
    expect(b.resourceOpenCount).toBe(1)
  })

  it('self-vs-exec score delta attributes both score tables via the prospect assignment', () => {
    const inputs = baseInputs()
    inputs.prospects = [prospect({ id: 'p1' })]
    inputs.selfScores = [
      { prospect_id: 'p1', total_score: 80 },
      { prospect_id: 'p1', total_score: 90 },
    ]
    inputs.execGrades = [{ prospect_id: 'p1', total_score: 70 }]
    const [a, b] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.selfScoreAvg).toBe(85)
    expect(a.execScoreAvg).toBe(70)
    expect(a.scoreDelta).toBe(15)
    // Empty tables (today's live state) → nulls, never NaN.
    expect(b.selfScoreAvg).toBeNull()
    expect(b.scoreDelta).toBeNull()
  })

  it('territory-quality-normalized deal size: price ÷ addressable_patients_primary', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({ id: 'p1', funded_won_at: '2026-07-01T00:00:00Z', stage: STAGE.FUNDED_WON }),
    ]
    inputs.deals = [
      { id: 'd1', prospect_id: 'p1', territory_id: 't1', territory_price: 179000, discount_reason: null, created_at: '2026-06-20T00:00:00Z' },
    ]
    inputs.territories = [{ id: 't1', name: 'Austin Westlake', addressable_patients_primary: 27978 }]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.avgPricePerAddressable).toBeCloseTo(179000 / 27978, 6)
    expect(a.deals[0].territoryName).toBe('Austin Westlake')
    expect(a.deals[0].addressable).toBe(27978)
  })

  it('a zero/NULL addressable territory never divides — sample is skipped, not Infinity', () => {
    const inputs = baseInputs()
    inputs.prospects = [
      prospect({ id: 'p1', funded_won_at: '2026-07-01T00:00:00Z', stage: STAGE.FUNDED_WON }),
    ]
    inputs.deals = [
      { id: 'd1', prospect_id: 'p1', territory_id: 't1', territory_price: 179000, discount_reason: null, created_at: '2026-06-20T00:00:00Z' },
    ]
    inputs.territories = [{ id: 't1', name: 'Unsized', addressable_patients_primary: null }]
    const [a] = computeRepCommandCenterMetrics(inputs, NOW)
    expect(a.avgPricePerAddressable).toBeNull()
    expect(a.deals[0].pricePerAddressable).toBeNull()
  })
})

describe('computeSpeedToLead (approximate — flagged proxy)', () => {
  it('averages created_at → FIRST touch and reports the sample size', () => {
    const prospects = [
      prospect({ id: 'p1', created_at: '2026-06-01T00:00:00Z' }),
      prospect({ id: 'p2', created_at: '2026-06-01T00:00:00Z' }),
      prospect({ id: 'p3' }), // no touches — excluded from the sample
    ]
    const firstTouch = new Map([
      ['p1', '2026-06-02T00:00:00Z'], // 1 day
      ['p2', '2026-06-04T00:00:00Z'], // 3 days
    ])
    const r = computeSpeedToLead(prospects, firstTouch)
    expect(r.avgDays).toBe(2)
    expect(r.sampleSize).toBe(2)
  })

  it('clamps back-dated touches at 0 rather than going negative', () => {
    const prospects = [prospect({ id: 'p1', created_at: '2026-06-10T00:00:00Z' })]
    const firstTouch = new Map([['p1', '2026-06-01T00:00:00Z']])
    const r = computeSpeedToLead(prospects, firstTouch)
    expect(r.avgDays).toBe(0)
  })

  it('the approximation is flagged AT the computation site, as §4D requires', () => {
    const src = read(METRICS)
    // The flag must live in the comment right above computeSpeedToLead — a future
    // reader at the code must see it, not just a doc.
    expect(src).toMatch(/APPROXIMATION[\s\S]{0,600}computeSpeedToLead/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Migration invariants (source-scan)
// ─────────────────────────────────────────────────────────────────────────────

describe('4d_discount_governance migration', () => {
  const raw = () => read(migrationPath())
  const sql = () => sqlCodeOnly(raw())

  it('DISCOUNT_REASONS stays in lockstep with the CHECK constraint', () => {
    const s = sql()
    for (const reason of DISCOUNT_REASONS) {
      expect(s).toContain(`'${reason}'`)
    }
    expect(s).toContain('deals_discount_reason_check')
  })

  it('the discount-economics CHECK pins the single-source $179,000 list price', () => {
    const s = sql()
    expect(s).toContain('deals_discount_requires_authorization_check')
    expect(s).toMatch(
      new RegExp(
        `territory_price\\s*>=\\s*${TERRITORY_STANDARD_PRICE}[\\s\\S]{0,200}discount_reason is not null and discount_authorized_by is not null`,
      ),
    )
  })

  it('locks BOTH discount columns out of every authenticated column grant (SELECT+INSERT+UPDATE)', () => {
    const s = sql()
    expect(s).toContain('revoke select, insert, update on public.deals from authenticated')
    // Dynamic regrant must exclude exactly the two discount columns.
    expect(s).toMatch(/column_name not in \('discount_reason', 'discount_authorized_by'\)/)
    expect(s).toMatch(/grant select \(%1\$s\), insert \(%1\$s\), update \(%1\$s\) on public\.deals to authenticated/)
  })

  it('the registry is service-role-only: RLS enabled, zero client grants, seeded executive', () => {
    const s = sql()
    expect(s).toContain(
      'alter table public.discount_authorizing_designations enable row level security',
    )
    expect(s).toContain(
      'revoke all on public.discount_authorizing_designations from anon, authenticated',
    )
    expect(s).toMatch(/insert into public\.discount_authorizing_designations \(designation\)\s*values \('executive'\)/)
    // No client policy may exist — enabled-no-policy is the point.
    expect(s).not.toMatch(/create policy[\s\S]*discount_authorizing_designations/i)
  })

  it('the authorization trigger is SECURITY DEFINER, pinned search_path, EXECUTE revoked, BEFORE INSERT/UPDATE', () => {
    const s = sql()
    expect(s).toContain('create or replace function public.validate_deal_discount_authorization()')
    expect(s).toMatch(/security definer\s*\nset search_path = ''/)
    expect(s).toContain(
      'revoke all on function public.validate_deal_discount_authorization() from public, anon, authenticated',
    )
    expect(s).toMatch(/before insert or update on public\.deals/)
    // Cross-table lookup joins internal_users to the registry.
    expect(s).toMatch(/from public\.internal_users iu\s*\n\s*join public\.discount_authorizing_designations/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Concealment invariants (spec §4D: existence hidden, not access denied)
// ─────────────────────────────────────────────────────────────────────────────

describe('§4D concealment boundary', () => {
  it('NAV_ITEMS (client-bundled) carries NOTHING about the Rep Command Center', () => {
    // The whole point of concealed-nav.ts: nav-items.ts ships in every viewer's
    // bundle, so the concealed route must never appear there — not as a label,
    // not as an href, not execOnly'd. Guards the future "consistency fix".
    for (const item of NAV_ITEMS) {
      expect(item.href ?? '').not.toContain('rep-command-center')
      expect(item.label.toLowerCase()).not.toContain('command center')
    }
    for (const tab of BOTTOM_TABS) {
      expect(tab.href).not.toContain('rep-command-center')
    }
  })

  it('concealed-nav is a server-only module that fails closed', () => {
    const src = read(CONCEALED_NAV)
    expect(src).toContain(`import 'server-only'`)
    // Executive-or-nothing: the only designation check must be strict equality.
    expect(codeOnly(src)).toMatch(
      /designation === 'executive' \? CONCEALED_EXEC_ITEMS : \[\]/,
    )
    expect(src).toContain(`href: '/rep-command-center'`)
  })

  it('Sidebar receives concealed items as DATA — only a type import, no value import', () => {
    const src = codeOnly(read(SIDEBAR))
    expect(src).toMatch(/import type \{ ConcealedNavItem \} from '\.\/concealed-nav'/)
    // No VALUE import of the server-only module in this client file.
    expect(src).not.toMatch(/import \{[^}]*concealedNavItemsFor[^}]*\} from/)
    // And the concealed label/href literals must not be hardcoded client-side.
    expect(src).not.toContain('rep-command-center')
    expect(src).not.toContain('Rep Command Center')
  })

  it('AppShell (server) resolves concealed items and threads them as a prop', () => {
    const src = codeOnly(read(APP_SHELL))
    expect(src).toMatch(/concealedNavItemsFor\(designation\)/)
  })

  it('the page 404s non-executives — never 403, never a redirect (intentional divergence, commented)', () => {
    const raw = read(PAGE)
    const src = codeOnly(raw)
    expect(src).toMatch(/designation !== 'executive'/)
    expect(src).toMatch(/notFound\(\)/)
    expect(src).not.toMatch(/redirect\(/)
    expect(src).not.toContain('403')
    // The do-not-fix-to-403 rationale must survive as a comment at the divergence
    // point (brief requirement — protects against a consistency "fix").
    expect(raw).toMatch(/DO NOT "FIX" THIS TO A 403/)
    // generateMetadata must gate too — no title leak in a non-exec <head>.
    expect(src).toMatch(/generateMetadata[\s\S]*?notFound\(\)/)
  })

  it('middleware rewrites non-exec /rep-command-center to an unmatched path (byte-identical 404)', () => {
    // The page's notFound() alone renders Next's DYNAMIC error shell, which differs
    // byte-wise from the static /_not-found document an unmatched URL serves (measured
    // on deploy-preview-139: 9008B vs 8195B). The middleware rewrite is what makes the
    // concealed route serve the EXACT same 404 asset — do not remove it.
    const src = codeOnly(read('src/middleware.ts'))
    expect(src).toMatch(/pathname === '\/rep-command-center'/)
    expect(src).toMatch(/startsWith\('\/rep-command-center\/'\)/)
    expect(src).toMatch(/designation'\)/) // self_read designation lookup
    expect(src).toMatch(/NextResponse\.rewrite/)
    // Fail closed: the rewrite fires unless designation === 'executive'.
    expect(src).toMatch(/isExecutive = data\?\.designation === 'executive'/)
    expect(src).not.toMatch(/rep-command-center[\s\S]{0,400}redirect\(/)
  })

  it('no API routes exist under rep-command-center (404-by-construction)', () => {
    const apiDir = join(process.cwd(), 'src/app/api')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name.includes('rep-command-center')) hits.push(join(dir, entry.name))
          walk(join(dir, entry.name))
        }
      }
    }
    walk(apiDir)
    expect(hits).toEqual([])
  })

  it('the view renders no "management tips" surface (explicit backlog, spec §4D)', () => {
    // Comment-stripped: the view's header comment NAMES the backlog item on
    // purpose (so a future session finds the pointer); the RENDERED surface
    // must not carry it.
    const src = codeOnly(read(VIEW)).toLowerCase()
    expect(src).not.toContain('management tip')
    expect(src).not.toContain('coming soon')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Token cleanliness (Hard Rule 8) on the new surfaces
// ─────────────────────────────────────────────────────────────────────────────

describe('design-token cleanliness', () => {
  const RAW_TAILWIND_COLOR =
    /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|accent|caret|placeholder)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
  const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/

  it.each([PAGE, VIEW])('%s uses tokens only', (rel) => {
    const src = codeOnly(read(rel))
    expect(src).not.toMatch(RAW_TAILWIND_COLOR)
    expect(src).not.toMatch(RAW_HEX)
  })
})
