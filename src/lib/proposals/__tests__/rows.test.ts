import { describe, expect, it } from 'vitest'
import type { ProspectEngagement } from '../../dashboard/triggers'
import {
  buildProposalRows,
  formatDwell,
  relativeTime,
  type ProposalRecord,
} from '../rows'

const NOW = new Date('2026-07-05T12:00:00.000Z').getTime()
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function engagement(over: Partial<ProspectEngagement> & { prospectId: string }): ProspectEngagement {
  return {
    who: 'Dr. Test',
    sessionCount: 0,
    cumulativeDwellMs: 0,
    financingClicks: 0,
    lastFinancingClickAt: null,
    lastSessionAt: null,
    lastEventAt: null,
    hottestSection: null,
    ...over,
  }
}

function proposal(over: Partial<ProposalRecord> & { id: string; prospect_id: string }): ProposalRecord {
  return { slug: `slug-${over.id}`, created_at: iso(30 * DAY), ...over }
}

describe('buildProposalRows', () => {
  it('joins each proposal to its prospect engagement and shapes the row', () => {
    const proposals = [proposal({ id: 'pr1', prospect_id: 'p1', slug: 'hausauer' })]
    const engagements = [
      engagement({
        prospectId: 'p1',
        who: 'Dr. Hausauer · Aesthetx',
        sessionCount: 4,
        cumulativeDwellMs: 6 * MIN,
        lastSessionAt: iso(2 * HOUR),
        lastEventAt: iso(1 * HOUR),
        hottestSection: 'financing',
      }),
    ]
    const [row] = buildProposalRows(proposals, engagements)
    expect(row).toMatchObject({
      proposalId: 'pr1',
      slug: 'hausauer',
      prospectId: 'p1',
      who: 'Dr. Hausauer · Aesthetx',
      visits: 4,
      totalDwellMs: 6 * MIN,
      hottestSection: 'financing',
    })
    // last seen = the later of last session / last event.
    expect(row.lastSeenAt).toBe(iso(1 * HOUR))
  })

  it('emits a zeroed, never-opened row when the prospect has no engagement', () => {
    const rows = buildProposalRows([proposal({ id: 'pr1', prospect_id: 'ghost' })], [])
    expect(rows[0]).toMatchObject({
      visits: 0,
      totalDwellMs: 0,
      lastSeenAt: null,
      hottestSection: null,
      who: 'Unknown prospect',
    })
  })

  it('orders most-recently-seen first, with never-opened proposals last (newest created first)', () => {
    const proposals = [
      proposal({ id: 'old-unopened', prospect_id: 'u1', created_at: iso(10 * DAY) }),
      proposal({ id: 'seen-2d', prospect_id: 'p2' }),
      proposal({ id: 'new-unopened', prospect_id: 'u2', created_at: iso(1 * DAY) }),
      proposal({ id: 'seen-1h', prospect_id: 'p1' }),
    ]
    const engagements = [
      engagement({ prospectId: 'p1', lastEventAt: iso(1 * HOUR) }),
      engagement({ prospectId: 'p2', lastSessionAt: iso(2 * DAY) }),
    ]
    const order = buildProposalRows(proposals, engagements).map((r) => r.proposalId)
    expect(order).toEqual(['seen-1h', 'seen-2d', 'new-unopened', 'old-unopened'])
  })
})

describe('formatDwell', () => {
  it('renders "—" for zero / absent dwell (no fabricated number)', () => {
    expect(formatDwell(0)).toBe('—')
    expect(formatDwell(-5)).toBe('—')
    expect(formatDwell(Number.NaN)).toBe('—')
  })

  it('formats seconds, minutes, and hours', () => {
    expect(formatDwell(45_000)).toBe('45s')
    expect(formatDwell(6 * MIN)).toBe('6m')
    expect(formatDwell(6 * MIN + 12_000)).toBe('6m 12s')
    expect(formatDwell(HOUR)).toBe('1h')
    expect(formatDwell(HOUR + 30 * MIN)).toBe('1h 30m')
  })
})

describe('relativeTime', () => {
  it('returns "Never opened" for null / unparseable input', () => {
    expect(relativeTime(null, NOW)).toBe('Never opened')
    expect(relativeTime('not-a-date', NOW)).toBe('Never opened')
  })

  it('bucket the elapsed time into just now / m / h / d / mo', () => {
    expect(relativeTime(iso(30_000), NOW)).toBe('just now')
    expect(relativeTime(iso(5 * MIN), NOW)).toBe('5m ago')
    expect(relativeTime(iso(3 * HOUR), NOW)).toBe('3h ago')
    expect(relativeTime(iso(4 * DAY), NOW)).toBe('4d ago')
    expect(relativeTime(iso(60 * DAY), NOW)).toBe('2mo ago')
  })
})
