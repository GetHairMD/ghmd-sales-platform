/**
 * Task G — end-to-end reconciliation against the ground-truth fixtures in data/sources/
 * (ghmd_county_analysis_PTI8.csv / PTI5.csv). Proves the SHIPPING formula (households ×
 * income × credit, with our state-CSV credit table) reconciles to the CORRECTED national
 * targets and to Marin.
 *
 * Credit source: the state-CSV table is authoritative — it matches the disclosed methodology
 * formula for all 51 states; the county fixture's credit column is stale/erroneous for 16
 * states (0/16 match the formula). See decision_log "National QA Targets Corrected — 16-State
 * Credit Discrepancy Resolved". So the authoritative national check recomputes with OUR credit
 * table (→ 69.6M / 56.3M), not the fixture's own addressable column (→ old 69.8M / 56.4M).
 * No live API calls.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { addressableHouseholds } from '../addressable'
import { creditShareForState } from '../credit-share'
import creditTable from '../../../data/experian-credit-share-by-state.json'

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === ',' && !q) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

interface CountyRow { county: string; state: string; hh: number; inc: number; cred: number; addr: number }

function loadCounties(path: string): CountyRow[] {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'))
  const h = splitCsv(lines[0])
  const iHH = h.findIndex(x => x.startsWith('households_SOURCE'))
  const iInc = h.findIndex(x => x.startsWith('share_income_above'))
  const iCred = h.findIndex(x => x.startsWith('est_share_fico_ge670_state'))
  const iAddr = h.findIndex(x => x.startsWith('addressable_households'))
  return lines.slice(1)
    .map(l => {
      const f = splitCsv(l)
      return { county: f[0], state: f[1], hh: +f[iHH], inc: +f[iInc], cred: +f[iCred], addr: +f[iAddr] }
    })
    .filter(r => Number.isFinite(r.hh) && Number.isFinite(r.inc) && Number.isFinite(r.cred) && Number.isFinite(r.addr))
}

const PTI8 = loadCounties('data/sources/ghmd_county_analysis_PTI8.csv')
const PTI5 = loadCounties('data/sources/ghmd_county_analysis_PTI5.csv')

/** Shipping-formula national total: recompute with OUR authoritative state-CSV credit table. */
function shippingNationalMillions(rows: CountyRow[]): number {
  const total = rows.reduce(
    (s, r) => s + addressableHouseholds(r.hh, r.inc, creditShareForState(r.state, creditTable)),
    0,
  )
  return Math.round(total / 100_000) / 10
}

describe('Task G reconciliation — fixtures loaded', () => {
  it('has the full county set with complete data (~3,144 of ~3,224; rest have suppressed ACS)', () => {
    expect(PTI8.length).toBeGreaterThan(3_100)
    expect(PTI5.length).toBe(PTI8.length)
  })
})

describe.each([
  // [label, rows, corrected shipping target, old fixture-column target]
  ['PTI8', PTI8, 69.6, 69.8],
  ['PTI5', PTI5, 56.3, 56.4],
] as const)('Task G reconciliation — %s', (label, rows, correctedM, oldFixtureM) => {
  it('fixture is internally self-consistent (hh × income × credit ≈ its addressable)', () => {
    const violations = rows.filter(r => {
      const recomputed = addressableHouseholds(r.hh, r.inc, r.cred)
      return Math.abs(recomputed - r.addr) > 1 + r.hh * 0.00015
    })
    expect(violations).toEqual([])
  })

  it(`SHIPPING national (our state-CSV credit) hits the CORRECTED target ${correctedM}M`, () => {
    expect(shippingNationalMillions(rows)).toBe(correctedM)
  })

  it(`fixture's own addressable column sums to the OLD ${oldFixtureM}M (pre-correction, stale for 16 states)`, () => {
    const total = rows.reduce((s, r) => s + r.addr, 0)
    expect(Math.round(total / 100_000) / 10).toBe(oldFixtureM)
  })

  it('RESOLVED: state-CSV credit is authoritative; fixture credit column stale for ≤16 states', () => {
    const perState = new Map<string, number>()
    for (const r of rows) if (!perState.has(r.state)) perState.set(r.state, r.cred)
    // CA (Marin's state) agrees in both, so Marin was never affected.
    expect(creditShareForState('CA', creditTable)).toBe(perState.get('CA'))
    const diverging = [...perState.entries()].filter(
      ([st, cred]) => Math.abs(creditShareForState(st, creditTable) - cred) > 0.0005,
    )
    expect(diverging.every(([st]) => Math.abs(creditShareForState(st, creditTable) - perState.get(st)!) < 0.02)).toBe(true)
    expect(diverging.length).toBeLessThanOrEqual(16)
  })
})

describe('Task G reconciliation — Marin spot-check (unchanged by the correction)', () => {
  it('Marin County, CA reconciles at 64,194 @PTI8 and 57,826 @PTI5', () => {
    const m8 = PTI8.find(r => /^Marin County, CA/.test(r.county))!
    const m5 = PTI5.find(r => /^Marin County, CA/.test(r.county))!
    expect(creditShareForState('CA', creditTable)).toBe(0.7172)
    expect(Math.abs(addressableHouseholds(m8.hh, m8.inc, creditShareForState('CA', creditTable)) - 64_194)).toBeLessThan(5)
    expect(Math.abs(addressableHouseholds(m5.hh, m5.inc, creditShareForState('CA', creditTable)) - 57_826)).toBeLessThan(5)
  })
})
