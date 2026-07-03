import { describe, expect, it } from 'vitest'
import {
  penetrationScenarios,
  viabilityLevel,
  meetsBaseFloor,
  displayCustomers,
  formatPenetrationRate,
  SCENARIO_DISPLAY_LABEL,
} from '../territory-sizing'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Marin: 64,194 addressable households @PTI8. Clears the floor at every scenario. */
const MARIN = 64_194
/** Below base floor: base (1%) = 50 < 62, but upside (2%) = 100 clears → yellow/marginal. */
const BELOW_FLOOR = 5_000
/** Below floor at every scenario: upside (2%) = 40 < 62 → red. */
const RED = 2_000

describe('penetrationScenarios — Marin fixture (above floor)', () => {
  const sizing = penetrationScenarios(MARIN)

  it('projects 321 / 642 / 1,284 customers (rounded for display)', () => {
    expect(sizing.scenarios.map(s => displayCustomers(s.customers))).toEqual([321, 642, 1284])
  })

  it('clears the floor at all three scenarios', () => {
    expect(sizing.scenarios.map(s => s.meetsFloor)).toEqual([true, true, true])
  })

  it('is green and clears the base floor', () => {
    expect(viabilityLevel(sizing)).toBe('green')
    expect(meetsBaseFloor(sizing)).toBe(true)
  })
})

describe('penetrationScenarios — below-floor fixture (marginal)', () => {
  const sizing = penetrationScenarios(BELOW_FLOOR)

  it('projects 25 / 50 / 100 — base falls below the 62 floor', () => {
    expect(sizing.scenarios.map(s => displayCustomers(s.customers))).toEqual([25, 50, 100])
    expect(sizing.scenarios.map(s => s.meetsFloor)).toEqual([false, false, true])
  })

  it('is yellow (clears only at upside) and does not clear the base floor', () => {
    expect(viabilityLevel(sizing)).toBe('yellow')
    expect(meetsBaseFloor(sizing)).toBe(false)
  })
})

describe('penetrationScenarios — red fixture (below floor everywhere)', () => {
  const sizing = penetrationScenarios(RED)

  it('does not clear the floor at any scenario', () => {
    expect(sizing.scenarios.every(s => !s.meetsFloor)).toBe(true)
  })

  it('is red', () => {
    expect(viabilityLevel(sizing)).toBe('red')
    expect(meetsBaseFloor(sizing)).toBe(false)
  })
})

describe('display helpers', () => {
  it('formats penetration rates without trailing zeros', () => {
    expect(formatPenetrationRate(0.005)).toBe('0.5%')
    expect(formatPenetrationRate(0.01)).toBe('1%')
    expect(formatPenetrationRate(0.02)).toBe('2%')
  })

  it('rounds unrounded engine customers for display', () => {
    // 64,194 × 0.005 = 320.97 → 321
    expect(displayCustomers(320.97)).toBe(321)
  })

  it('labels scenarios Conservative / Base / Upside', () => {
    expect(SCENARIO_DISPLAY_LABEL).toEqual({ low: 'Conservative', base: 'Base', high: 'Upside' })
  })
})
