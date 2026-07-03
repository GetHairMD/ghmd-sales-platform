/**
 * Territory sizing + penetration scenarios — formula-v2-public-source, Tasks E & F.
 *
 * Given a territory's addressable market, expresses expected customers at each of the
 * three penetration scenarios (0.5% / 1% / 2%) and whether it clears the locked
 * CUSTOMERS_NEEDED floor (62). Constants come from /lib/addressable-market-constants (Rule 6).
 */

import {
  CUSTOMERS_NEEDED,
  PENETRATION_SCENARIOS,
  PENETRATION_SOURCE,
  type PenetrationScenario,
} from '../../lib/addressable-market-constants'

export interface ScenarioResult extends PenetrationScenario {
  /** Expected customers = addressable × rate (not rounded to keep aggregation exact). */
  customers: number
  /** Whether expected customers clears CUSTOMERS_NEEDED (62). */
  meetsFloor: boolean
}

export interface SizingResult {
  addressable: number
  customersNeeded: number
  scenarios: ScenarioResult[]
  /** Provenance string for the base penetration rate (surface in proposal output). */
  penetrationSource: string
}

/** Expected customers for an addressable count at a penetration rate. */
export function expectedCustomers(addressable: number, rate: number): number {
  return Math.max(0, addressable) * rate
}

/** Minimum addressable market required to reach CUSTOMERS_NEEDED at a given rate. */
export function minAddressableForFloor(rate: number): number {
  if (rate <= 0) return Infinity
  return Math.ceil(CUSTOMERS_NEEDED / rate)
}

/**
 * Compute all three penetration scenarios for a territory's addressable market.
 * Every proposal shows all three (low → high).
 */
export function penetrationScenarios(addressable: number): SizingResult {
  const scenarios: ScenarioResult[] = PENETRATION_SCENARIOS.map(s => {
    const customers = expectedCustomers(addressable, s.rate)
    return { ...s, customers, meetsFloor: customers >= CUSTOMERS_NEEDED }
  })

  return {
    addressable: Math.max(0, addressable),
    customersNeeded: CUSTOMERS_NEEDED,
    scenarios,
    penetrationSource: PENETRATION_SOURCE,
  }
}
