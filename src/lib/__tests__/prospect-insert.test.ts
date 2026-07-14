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

  it('passes through the explicitly-selected rep id (E-0a rep attribution)', () => {
    // The value is the assigned rep's user_id from the UI selector — NOT the creating
    // exec's uid. Pure passthrough: the builder never infers it from a caller identity.
    const repId = '11111111-2222-3333-4444-555555555555'
    const payload = buildProspectInsert({ full_name: 'Jane', assigned_rep_id: repId })
    expect(payload.assigned_rep_id).toBe(repId)
    // assigned_rep_id is a real FK column and must survive the column guard.
    expect(PROSPECT_INSERT_COLUMNS).toContain('assigned_rep_id')
  })

  it('defaults assigned_rep_id to null only when none is provided (non-UI caller)', () => {
    // Nullable FK: never fabricate an id. The new-prospect UI requires a selection, so
    // null only arises for a non-UI caller (e.g. a future webhook import).
    expect(buildProspectInsert({ full_name: 'Jane' }).assigned_rep_id).toBeNull()
    expect(buildProspectInsert({ full_name: 'Jane', assigned_rep_id: null }).assigned_rep_id).toBeNull()
  })
})
