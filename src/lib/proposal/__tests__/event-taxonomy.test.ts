import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ALL_PROPOSAL_EVENT_TYPES,
  CLIENT_EVENT_TYPES,
  SERVER_EVENT_TYPES,
  WEBHOOK_EVENT_TYPES,
  isClientProposalEvent,
} from '../events'

/**
 * Guards the proposal event taxonomy (spec §7). The TS module
 * (src/lib/proposal/events.ts) and the database CHECK constraint must never
 * drift — this test parses the migration SQL and compares the two sets.
 */

const MIGRATION =
  'supabase/migrations/20260705120000_proposal_events_session_c_taxonomy.sql'

function eventTypesInMigrationCheck(): Set<string> {
  const sql = readFileSync(join(process.cwd(), MIGRATION), 'utf8')
  const start = sql.indexOf('array[')
  const end = sql.indexOf(']::text[]', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const block = sql.slice(start, end)
  const found = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  return new Set(found)
}

describe('proposal event taxonomy — module ↔ migration parity (spec §7)', () => {
  it('migration CHECK lists exactly ALL_PROPOSAL_EVENT_TYPES', () => {
    const fromSql = eventTypesInMigrationCheck()
    const fromTs = new Set<string>(ALL_PROPOSAL_EVENT_TYPES)
    expect([...fromSql].sort()).toEqual([...fromTs].sort())
  })

  it('covers every §7 event type', () => {
    for (const t of [
      'session_start',
      'section_view',
      'calculator_interaction',
      'section_dwell',
      'video_play',
      'case_study_tab',
      'financing_cta_click',
      'calendly_open',
      'get_started_click',
      'calendly_booked',
    ]) {
      expect(ALL_PROPOSAL_EVENT_TYPES).toContain(t)
    }
  })
})

describe('proposal event taxonomy — emit-path partition', () => {
  it('server/client/webhook sets are disjoint and cover ALL', () => {
    const all = [...SERVER_EVENT_TYPES, ...CLIENT_EVENT_TYPES, ...WEBHOOK_EVENT_TYPES]
    expect(new Set(all).size).toBe(all.length) // no overlap
    expect([...new Set(all)].sort()).toEqual([...new Set(ALL_PROPOSAL_EVENT_TYPES)].sort())
  })

  it('client route never accepts server- or webhook-only events', () => {
    expect(isClientProposalEvent('session_start')).toBe(false)
    expect(isClientProposalEvent('calendly_booked')).toBe(false)
    expect(isClientProposalEvent('video_play')).toBe(true)
    expect(isClientProposalEvent('financing_cta_click')).toBe(true)
    expect(isClientProposalEvent('nope')).toBe(false)
    expect(isClientProposalEvent(42)).toBe(false)
  })
})
