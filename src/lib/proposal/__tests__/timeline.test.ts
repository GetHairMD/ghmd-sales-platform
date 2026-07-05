import { describe, expect, it } from 'vitest'
import { buildTimeline } from '../timeline'

const NOW = new Date('2026-07-05T12:00:00.000Z').getTime()
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const MIN = 60_000

describe('buildTimeline', () => {
  it('merges sessions, events, and activities newest-first', () => {
    const tl = buildTimeline({
      sessions: [{ id: 's1', started_at: iso(50 * MIN) }],
      events: [
        { id: 'e1', event_type: 'section_view', payload: { section: 'Investment' }, created_at: iso(40 * MIN) },
        { id: 'e2', event_type: 'financing_cta_click', payload: null, created_at: iso(10 * MIN) },
      ],
      activities: [{ id: 'a1', created_at: iso(30 * MIN), activity_type: 'note', body: 'Called, left VM' }],
    })
    expect(tl.map((e) => e.id)).toEqual(['event:e2', 'activity:a1', 'event:e1', 'session:s1'])
    expect(tl[0]).toMatchObject({ kind: 'proposal_event', hot: true, title: 'Clicked “See what you qualify for”' })
    expect(tl.find((e) => e.id === 'event:e1')!.title).toBe('Viewed Investment')
    expect(tl.find((e) => e.id === 'session:s1')!.title).toBe('Opened the proposal')
  })

  it('drops session_start events (deduped against proposal_sessions)', () => {
    const tl = buildTimeline({
      sessions: [{ id: 's1', started_at: iso(10 * MIN) }],
      events: [{ id: 'e1', event_type: 'session_start', payload: null, created_at: iso(10 * MIN) }],
      activities: [],
    })
    expect(tl).toHaveLength(1)
    expect(tl[0].kind).toBe('session')
  })

  it('renders dwell as minutes and flags booked as hot', () => {
    const tl = buildTimeline({
      sessions: [],
      events: [
        { id: 'e1', event_type: 'section_dwell', payload: { section: 'Territory', dwell_ms: 3 * MIN }, created_at: iso(5 * MIN) },
        { id: 'e2', event_type: 'calendly_booked', payload: null, created_at: iso(1 * MIN) },
      ],
      activities: [],
    })
    expect(tl.find((e) => e.id === 'event:e1')!.title).toBe('Spent 3 min on Territory')
    expect(tl.find((e) => e.id === 'event:e2')).toMatchObject({ title: 'Booked a call', hot: true })
  })

  it('drops entries with an unparseable timestamp', () => {
    const tl = buildTimeline({
      sessions: [],
      events: [{ id: 'bad', event_type: 'section_view', payload: null, created_at: 'not-a-date' }],
      activities: [{ id: 'a1', created_at: iso(1 * MIN), activity_type: 'note', body: 'ok' }],
    })
    expect(tl.map((e) => e.id)).toEqual(['activity:a1'])
  })

  it('humanizes activity types and preserves the body as detail', () => {
    const tl = buildTimeline({
      sessions: [],
      events: [],
      activities: [{ id: 'a1', created_at: iso(1 * MIN), activity_type: 'proposal_message', body: 'Interested — call me' }],
    })
    expect(tl[0]).toMatchObject({ title: 'proposal message', detail: 'Interested — call me' })
  })
})
