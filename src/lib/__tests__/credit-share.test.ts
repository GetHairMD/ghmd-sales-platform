import { describe, expect, it } from 'vitest'
import { creditShareForState, loadCreditShareFile } from '../credit-share'
import { EXPERIAN_NATIONAL_CREDIT_SHARE } from '../../../lib/addressable-market-constants'

describe('creditShareForState', () => {
  const table = { states: { CA: 0.72, TX: 0.66 } }

  it('returns the per-state override when present', () => {
    expect(creditShareForState('CA', table)).toBe(0.72)
    expect(creditShareForState('TX', table)).toBe(0.66)
  })

  it('is case-insensitive and trims the state code', () => {
    expect(creditShareForState('ca', table)).toBe(0.72)
    expect(creditShareForState('  CA ', table)).toBe(0.72)
  })

  it('falls back to the national share for states without an override', () => {
    expect(creditShareForState('WY', table)).toBe(EXPERIAN_NATIONAL_CREDIT_SHARE)
    expect(creditShareForState('', table)).toBe(EXPERIAN_NATIONAL_CREDIT_SHARE)
  })

  it('falls back to national when the states map is empty (state_data_pending)', () => {
    expect(creditShareForState('CA', { states: {} })).toBe(EXPERIAN_NATIONAL_CREDIT_SHARE)
  })
})

describe('loadCreditShareFile', () => {
  it('parses a well-formed file', () => {
    const f = loadCreditShareFile({ provenance: {}, state_data_pending: true, states: {} })
    expect(f.states).toEqual({})
  })

  it('throws on a malformed file', () => {
    expect(() => loadCreditShareFile(null)).toThrow(/malformed/)
    expect(() => loadCreditShareFile({ states: null })).toThrow(/malformed/)
  })
})
