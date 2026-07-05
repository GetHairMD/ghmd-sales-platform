/**
 * Shared Storybook fixture for the /p/[slug] proposal sections.
 * Realistic San Rafael, CA territory. Presentation-ready values only —
 * final display fields only, mirroring ProposalRecord exactly.
 */
import type {
  DemandMatrix,
  PenetrationScenarioView,
  ProposalRecord,
} from '@/lib/proposal/types'

const demandMatrix: DemandMatrix = {
  source: 'ACS B01001 (2024 ACS5)',
  vintage: 2024,
  cohorts: [
    { ageBand: '18-24', male: 620, female: 590 },
    { ageBand: '25-29', male: 710, female: 700 },
    { ageBand: '30-34', male: 940, female: 980 },
    { ageBand: '35-39', male: 1120, female: 1210 },
    { ageBand: '40-44', male: 1180, female: 1290 },
    { ageBand: '45-49', male: 1040, female: 1160 },
    { ageBand: '50-54', male: 910, female: 1050 },
    { ageBand: '55-59', male: 760, female: 900 },
    { ageBand: '60-64', male: 640, female: 780 },
    { ageBand: '65+', male: 1180, female: 1490 },
  ],
}

export const mockProposal: ProposalRecord = {
  id: 'prop_mock_0001',
  prospect_id: 'prospect_mock_0001',
  slug: 'san-rafael-demo',
  prospect_name_full: 'Dr. Elena Marchetti',
  practice_name: 'Marin Aesthetic & Wellness',
  practice_logo_url: null,
  specialty: 'Dermatology',
  territory_name: 'San Rafael, CA',
  prospect_photo_url: null,
  territory_polygon: null,
  territory_pin_lat: 37.9735,
  territory_pin_lng: -122.5311,
  prepared_month: 'July 2026',
  addressable_market_total: 11100,
  addressable_market_male_pct: 44.2,
  addressable_market_female_pct: 55.8,
  demand_matrix: demandMatrix,
  new_patients_range_low: 75,
  new_patients_range_high: 150,
  scenario_inputs: {
    patient_base: 2400,
    candidate_pct: 37,
    conversion_pace: 84,
  },
  scenario_outputs: {
    conservative: 378000,
    moderate: 546000,
    growth: 714000,
    break_even_months: 9,
  },
}

export const mockPenetration: PenetrationScenarioView[] = [
  { label: 'Conservative', rate: 0.008, customers: 89 },
  { label: 'Base', rate: 0.015, customers: 167 },
  { label: 'Upside', rate: 0.025, customers: 278 },
]
