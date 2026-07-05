/**
 * Shared types for the gated /p/[slug] proposal system (Session B).
 *
 * These describe ONLY final, presentation-ready values. No formula mechanics
 * (income thresholds, credit methodology, PTI levels, intermediate calcs) are
 * represented here — those never cross the server→client boundary (brief §2.1).
 */

/** ACS B01001 age × sex demographic composition for the territory (decision #68).
 *  This is territory demographic context — NOT a demand/qualification weighting. */
export interface DemandMatrix {
  /** e.g. "ACS B01001 (2024 ACS5)". Human-readable provenance. */
  source: string
  vintage: number
  cohorts: DemandCohort[]
}

export interface DemandCohort {
  /** e.g. "45-49" — matches lib/census/queries.ts B01001 age bands. */
  ageBand: string
  male: number
  female: number
}

/** Section 3 sample-scenario inputs (spec §5). */
export interface ScenarioInputs {
  patient_base: number
  candidate_pct: number
  conversion_pace: number
}

/** Section 3 scenario outputs — stored formula-v2 result; the calculator scales
 *  these client-side (never re-derives from raw constants in the browser). */
export interface ScenarioOutputs {
  conservative: number
  moderate: number
  growth: number
  break_even_months: number
}

/** Full proposal record as fetched server-side for rendering. */
export interface ProposalRecord {
  id: string
  prospect_id: string
  slug: string
  prospect_name_full: string | null
  practice_name: string | null
  practice_logo_url: string | null
  specialty: string | null
  territory_name: string | null
  prospect_photo_url: string | null
  territory_polygon: unknown | null
  territory_pin_lat: number | null
  territory_pin_lng: number | null
  prepared_month: string | null
  addressable_market_total: number | null
  addressable_market_male_pct: number | null
  addressable_market_female_pct: number | null
  demand_matrix: DemandMatrix | null
  new_patients_range_low: number | null
  new_patients_range_high: number | null
  scenario_inputs: ScenarioInputs | null
  scenario_outputs: ScenarioOutputs | null
}

export type ProposalEventType =
  | 'session_start'
  | 'section_view'
  | 'calculator_interaction'

/** Penetration scenario view — computed server-side, passed to the client as
 *  final numbers only (no viability fields, no formula constants). */
export interface PenetrationScenarioView {
  label: string
  rate: number
  customers: number
}
