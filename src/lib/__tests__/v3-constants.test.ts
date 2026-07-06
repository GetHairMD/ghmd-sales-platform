import { describe, expect, it } from 'vitest'
import {
  CUSTOMERS_NEEDED,
  PENETRATION_RATE_LOW,
  V3_VIABILITY_BUFFER,
  V3_MIN_VIABLE_CUSTOMERS,
  V3_MIN_ADDRESSABLE_FLOOR,
  V3_MAX_DRIVE_MINUTES,
} from '../../../lib/addressable-market-constants'

/**
 * v3 drive-time sizing constants (decision_log #89, methodology §8.3).
 * These lock the values AND their derivation so a future edit that breaks the
 * 62 × 1.5 → 93 → ÷0.5% → 18,600 chain fails loudly.
 */
describe('v3 sizing constants (decision #89 / methodology §8.3)', () => {
  it('locks the four v3 constants to their decided values', () => {
    expect(V3_VIABILITY_BUFFER).toBe(1.5)
    expect(V3_MIN_VIABLE_CUSTOMERS).toBe(93)
    expect(V3_MIN_ADDRESSABLE_FLOOR).toBe(18_600)
    expect(V3_MAX_DRIVE_MINUTES).toBe(45)
  })

  it('min viable customers = CUSTOMERS_NEEDED × V3_VIABILITY_BUFFER (62 × 1.5 = 93)', () => {
    expect(CUSTOMERS_NEEDED * V3_VIABILITY_BUFFER).toBe(V3_MIN_VIABLE_CUSTOMERS)
  })

  it('addressable floor = min viable customers ÷ Conservative 0.5% rate (93 ÷ 0.005 = 18,600)', () => {
    expect(V3_MIN_VIABLE_CUSTOMERS / PENETRATION_RATE_LOW).toBe(V3_MIN_ADDRESSABLE_FLOOR)
  })

  it('does not disturb the v2 anchors it is derived from', () => {
    expect(CUSTOMERS_NEEDED).toBe(62)
    expect(PENETRATION_RATE_LOW).toBe(0.005)
  })
})
