import { describe, expect, it } from 'vitest'
import {
  expectedCustomers,
  minAddressableForFloor,
  penetrationScenarios,
} from '../territory-sizing'
import {
  CUSTOMERS_NEEDED,
  PENETRATION_RATE_BASE,
  PENETRATION_RATE_LOW,
  PENETRATION_RATE_HIGH,
} from '../../../lib/addressable-market-constants'

describe('constants (Task E/F locks)', () => {
  it('CUSTOMERS_NEEDED is 62 and rates are 0.5% / 1% / 2%', () => {
    expect(CUSTOMERS_NEEDED).toBe(62)
    expect(PENETRATION_RATE_LOW).toBe(0.005)
    expect(PENETRATION_RATE_BASE).toBe(0.01)
    expect(PENETRATION_RATE_HIGH).toBe(0.02)
  })
})

describe('expectedCustomers', () => {
  it('multiplies addressable by rate', () => {
    expect(expectedCustomers(10_000, 0.01)).toBe(100)
    expect(expectedCustomers(6_200, 0.01)).toBe(62)
  })
  it('never returns negative for a negative addressable', () => {
    expect(expectedCustomers(-5, 0.01)).toBe(0)
  })
})

describe('minAddressableForFloor', () => {
  it('is ceil(62 / rate)', () => {
    expect(minAddressableForFloor(0.01)).toBe(6_200)   // 62 / 0.01
    expect(minAddressableForFloor(0.005)).toBe(12_400) // 62 / 0.005
    expect(minAddressableForFloor(0.02)).toBe(3_100)   // 62 / 0.02
  })
  it('is Infinity for a non-positive rate', () => {
    expect(minAddressableForFloor(0)).toBe(Infinity)
  })
})

describe('penetrationScenarios', () => {
  it('returns all three scenarios low→high with customers + meetsFloor', () => {
    const r = penetrationScenarios(10_000)
    expect(r.scenarios.map(s => s.key)).toEqual(['low', 'base', 'high'])
    expect(r.scenarios.map(s => s.customers)).toEqual([50, 100, 200])
    // at 10k addressable: low(50) < 62 fails, base(100)/high(200) clear
    expect(r.scenarios.map(s => s.meetsFloor)).toEqual([false, true, true])
    expect(r.customersNeeded).toBe(62)
    expect(r.penetrationSource).toMatch(/QuickBooks/)
  })

  it('flags the exact 62-customer boundary as met (≥, not >)', () => {
    // 6,200 addressable × 1% base = exactly 62
    const r = penetrationScenarios(6_200)
    const base = r.scenarios.find(s => s.key === 'base')!
    expect(base.customers).toBe(62)
    expect(base.meetsFloor).toBe(true)
  })

  it('clamps a negative addressable to 0', () => {
    const r = penetrationScenarios(-100)
    expect(r.addressable).toBe(0)
    expect(r.scenarios.every(s => s.customers === 0 && !s.meetsFloor)).toBe(true)
  })
})
