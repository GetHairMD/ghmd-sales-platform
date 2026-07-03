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

/** Traffic-light viability, keyed off the base scenario then the upside bound. */
export type ViabilityLevel = 'green' | 'yellow' | 'red'

/**
 * green  — base (1%) scenario clears the CUSTOMERS_NEEDED floor.
 * yellow — base falls short but the upside (2%) scenario clears it (marginal).
 * red    — even the upside scenario falls short (below floor at every scenario).
 */
export function viabilityLevel(result: SizingResult): ViabilityLevel {
  const base = result.scenarios.find(s => s.key === 'base')
  const high = result.scenarios.find(s => s.key === 'high')
  if (base?.meetsFloor) return 'green'
  if (high?.meetsFloor) return 'yellow'
  return 'red'
}

/** True when the base (1%) scenario clears the floor. Internal-only signal (not shown to prospects). */
export function meetsBaseFloor(result: SizingResult): boolean {
  return result.scenarios.find(s => s.key === 'base')?.meetsFloor ?? false
}

// ─────────────────────────────────────────────────────────────────────────────
// Display helpers (shared by public + internal scenario cards)
// ─────────────────────────────────────────────────────────────────────────────

/** Prospect-friendly names for the three scenarios. */
export const SCENARIO_DISPLAY_LABEL: Record<'low' | 'base' | 'high', string> = {
  low: 'Conservative',
  base: 'Base',
  high: 'Upside',
}

/** Format a penetration rate for display: 0.005 → "0.5%", 0.01 → "1%", 0.02 → "2%". */
export function formatPenetrationRate(rate: number): string {
  return `${+(rate * 100).toFixed(2)}%`
}

/** Whole-customer figure for display (the engine keeps customers unrounded for exact aggregation). */
export function displayCustomers(customers: number): number {
  return Math.round(customers)
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
