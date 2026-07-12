import { describe, expect, it } from 'vitest'
import { groupProspectsByDealStatus } from '../group-by-deal-status'

type Row = { id: string; deal_status?: string | null }

describe('groupProspectsByDealStatus', () => {
  it('buckets rows into active / stalled / lost', () => {
    const rows: Row[] = [
      { id: 'a', deal_status: 'active' },
      { id: 's', deal_status: 'stalled' },
      { id: 'l', deal_status: 'lost' },
    ]
    const grouped = groupProspectsByDealStatus(rows)
    expect(grouped.active.map((r) => r.id)).toEqual(['a'])
    expect(grouped.stalled.map((r) => r.id)).toEqual(['s'])
    expect(grouped.lost.map((r) => r.id)).toEqual(['l'])
  })

  it('always returns all three keys even when a bucket is empty', () => {
    const grouped = groupProspectsByDealStatus([])
    expect(grouped).toEqual({ active: [], stalled: [], lost: [] })
  })

  it('preserves input order within each bucket', () => {
    const rows: Row[] = [
      { id: 'a1', deal_status: 'active' },
      { id: 'a2', deal_status: 'active' },
      { id: 'a3', deal_status: 'active' },
    ]
    expect(groupProspectsByDealStatus(rows).active.map((r) => r.id)).toEqual([
      'a1',
      'a2',
      'a3',
    ])
  })

  it('treats null / missing / unrecognized deal_status as active (the DB default)', () => {
    const rows: Row[] = [
      { id: 'n', deal_status: null },
      { id: 'm' },
      { id: 'x', deal_status: 'bogus' },
    ]
    expect(groupProspectsByDealStatus(rows).active.map((r) => r.id)).toEqual([
      'n',
      'm',
      'x',
    ])
  })
})
