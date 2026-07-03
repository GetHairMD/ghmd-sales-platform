import { describe, expect, it } from 'vitest'
import {
  buildProspectInsert,
  PROSPECT_INSERT_COLUMNS,
} from '../prospect-insert'

describe('buildProspectInsert (P0 insert-shape guard)', () => {
  it('enters new prospects at integer stage 1, not a string', () => {
    const payload = buildProspectInsert({ full_name: 'Jane Doe' })
    // The exact bug the old form shipped: stage: 'new_lead' into a NOT NULL integer column.
    expect(payload.stage).toBe(1)
    expect(Number.isInteger(payload.stage)).toBe(true)
    expect(typeof payload.stage).not.toBe('string')
  })

  it('maps the "source channel" UI field to the real lead_source column', () => {
    const payload = buildProspectInsert({ full_name: 'Jane', lead_source: 'referral' })
    expect(payload.lead_source).toBe('referral')
    // source_channel is NOT a real column and must never appear in the payload.
    expect(payload).not.toHaveProperty('source_channel')
  })

  it('only ever writes real prospects columns', () => {
    const payload = buildProspectInsert({
      full_name: 'Jane',
      email: 'jane@example.com',
      phone: '555',
      lead_source: 'event',
    })
    for (const key of Object.keys(payload)) {
      expect(PROSPECT_INSERT_COLUMNS).toContain(key)
    }
  })

  it('defaults empty optional fields to null and assigned_rep to trace', () => {
    const payload = buildProspectInsert({ full_name: 'Jane' })
    expect(payload.email).toBeNull()
    expect(payload.phone).toBeNull()
    expect(payload.lead_source).toBeNull()
    expect(payload.assigned_rep).toBe('trace')
  })
})
