import { describe, expect, it } from 'vitest'
import {
  HIGH_DWELL_THRESHOLD_MS,
  aggregateEngagement,
  computeEngagementFeed,
  computeHotLeads,
  detectTriggers,
  type ProposalEventRow,
  type ProposalSessionRow,
  type ProspectDisplay,
  type ProspectEngagement,
} from '../triggers'

const NOW = new Date('2026-07-05T12:00:00.000Z').getTime()
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const PROSPECTS: ProspectDisplay[] = [
  { id: 'p1', full_name: 'Dr. Hausauer', practice_name: 'Aesthetx' },
  { id: 'p2', full_name: 'Dr. Petrov', practice_name: null },
  { id: 'p3', full_name: 'Dr. Cold', practice_name: 'Ice Clinic' },
]

function engagement(over: Partial<ProspectEngagement>): ProspectEngagement {
  return {
    prospectId: 'p1',
    who: 'Dr. Hausauer · Aesthetx',
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

describe('aggregateEngagement', () => {
  const sessions: ProposalSessionRow[] = [
    { prospect_id: 'p1', started_at: iso(3 * DAY) },
    { prospect_id: 'p1', started_at: iso(2 * DAY) },
    { prospect_id: 'p1', started_at: iso(1 * DAY) },
    { prospect_id: 'p2', started_at: iso(1 * DAY) },
  ]
  const events: ProposalEventRow[] = [
    { prospect_id: 'p1', event_type: 'financing_cta_click', payload: null, created_at: iso(1 * DAY) },
    { prospect_id: 'p1', event_type: 'section_dwell', payload: { section: 'Investment', dwell_ms: 200_000 }, created_at: iso(1 * DAY) },
    { prospect_id: 'p1', event_type: 'section_dwell', payload: { section: 'Territory', dwell_ms: 150_000 }, created_at: iso(1 * DAY) },
    { prospect_id: 'p2', event_type: 'section_dwell', payload: { section: 'Hero', dwell_ms: 30_000 }, created_at: iso(1 * DAY) },
    // Row for an unknown prospect must be ignored (caller controls the set).
    { prospect_id: 'ghost', event_type: 'financing_cta_click', payload: null, created_at: iso(1 * DAY) },
  ]

  it('rolls sessions + events up per prospect and ignores unknown ids', () => {
    const agg = aggregateEngagement(events, sessions, PROSPECTS)
    expect(agg.map((e) => e.prospectId).sort()).toEqual(['p1', 'p2', 'p3'])

    const p1 = agg.find((e) => e.prospectId === 'p1')!
    expect(p1.sessionCount).toBe(3)
    expect(p1.financingClicks).toBe(1)
    expect(p1.cumulativeDwellMs).toBe(350_000)
    expect(p1.hottestSection).toBe('Investment') // 200k > 150k
    expect(p1.who).toBe('Dr. Hausauer · Aesthetx')

    const p2 = agg.find((e) => e.prospectId === 'p2')!
    expect(p2.sessionCount).toBe(1)
    expect(p2.cumulativeDwellMs).toBe(30_000)
    expect(p2.who).toBe('Dr. Petrov') // no practice suffix

    const p3 = agg.find((e) => e.prospectId === 'p3')!
    expect(p3.sessionCount).toBe(0)
    expect(p3.lastEventAt).toBeNull()
  })

  it('ignores malformed dwell payloads', () => {
    const agg = aggregateEngagement(
      [
        { prospect_id: 'p1', event_type: 'section_dwell', payload: { dwell_ms: 'nope' }, created_at: iso(HOUR) },
        { prospect_id: 'p1', event_type: 'section_dwell', payload: { dwell_ms: -5 }, created_at: iso(HOUR) },
        { prospect_id: 'p1', event_type: 'section_dwell', payload: null, created_at: iso(HOUR) },
      ],
      [],
      PROSPECTS,
    )
    expect(agg.find((e) => e.prospectId === 'p1')!.cumulativeDwellMs).toBe(0)
  })
})

describe('detectTriggers', () => {
  it('fires financing (hottest), then dwell, then sessions — sorted by weight', () => {
    const hits = detectTriggers(
      engagement({
        financingClicks: 1,
        lastFinancingClickAt: iso(HOUR),
        cumulativeDwellMs: HIGH_DWELL_THRESHOLD_MS + 1,
        sessionCount: 3,
        lastSessionAt: iso(HOUR),
        lastEventAt: iso(HOUR),
      }),
    )
    expect(hits.map((h) => h.type)).toEqual(['financing_cta_click', 'high_dwell', 'third_session'])
    expect(hits[0].weight).toBeGreaterThan(hits[1].weight)
  })

  it('does not fire dwell exactly at the threshold (strictly greater)', () => {
    const hits = detectTriggers(engagement({ cumulativeDwellMs: HIGH_DWELL_THRESHOLD_MS }))
    expect(hits).toHaveLength(0)
  })

  it('does not fire sessions below the 3rd', () => {
    expect(detectTriggers(engagement({ sessionCount: 2, lastSessionAt: iso(HOUR) }))).toHaveLength(0)
  })

  it('returns nothing for an unengaged prospect', () => {
    expect(detectTriggers(engagement({}))).toHaveLength(0)
  })
})

describe('computeHotLeads', () => {
  it('includes trigger hits within 7 days, hottest first, and excludes stale ones', () => {
    const engagements = [
      engagement({ prospectId: 'p1', who: 'A', financingClicks: 1, lastFinancingClickAt: iso(2 * DAY) }),
      engagement({ prospectId: 'p2', who: 'B', sessionCount: 3, lastSessionAt: iso(1 * DAY) }),
      // Stale: crossed threshold 10 days ago → excluded from the 7-day window.
      engagement({ prospectId: 'p3', who: 'C', financingClicks: 1, lastFinancingClickAt: iso(10 * DAY) }),
    ]
    const leads = computeHotLeads(engagements, NOW)
    expect(leads.map((l) => l.prospectId)).toEqual(['p1', 'p2'])
    expect(leads[0].type).toBe('financing_cta_click')
  })

  it('is empty when nothing recent qualifies', () => {
    expect(computeHotLeads([engagement({ sessionCount: 1, lastSessionAt: iso(HOUR) })], NOW)).toHaveLength(0)
  })
})

describe('computeEngagementFeed', () => {
  it('maps weight to priority chips and sorts by heat', () => {
    const feed = computeEngagementFeed(
      [
        engagement({ prospectId: 'p1', who: 'Hot', financingClicks: 1, lastFinancingClickAt: iso(HOUR), lastEventAt: iso(HOUR) }),
        engagement({ prospectId: 'p2', who: 'Warm', cumulativeDwellMs: HIGH_DWELL_THRESHOLD_MS + 1, lastEventAt: iso(HOUR) }),
        engagement({ prospectId: 'p3', who: 'Cool', sessionCount: 1, lastEventAt: iso(HOUR) }),
      ],
      NOW,
    )
    expect(feed.map((f) => [f.who, f.priority])).toEqual([
      ['Hot', 'High'],
      ['Warm', 'Med'],
      ['Cool', 'Low'],
    ])
    expect(feed.every((f) => f.category === 'ENGAGEMENT')).toBe(true)
  })

  it('omits prospects with zero engagement and respects the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      engagement({ prospectId: `p${i}`, who: `p${i}`, financingClicks: 1, lastFinancingClickAt: iso(HOUR), lastEventAt: iso(HOUR) }),
    )
    many.push(engagement({ prospectId: 'idle', who: 'idle' })) // no engagement → omitted
    const feed = computeEngagementFeed(many, NOW, 12)
    expect(feed).toHaveLength(12)
    expect(feed.some((f) => f.prospectId === 'idle')).toBe(false)
  })
})
