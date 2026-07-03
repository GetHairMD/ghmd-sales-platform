/**
 * Addressable Market Formula Constants
 *
 * Single source of truth for all territory analysis calculations.
 * Never hardcode these values inline in Edge Functions or components.
 * All values locked as of Build Spec v1.0 — changes require Trace approval.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Hair Loss Prevalence by Age Cohort
// Proportion of population with clinically meaningful hair loss
// ─────────────────────────────────────────────────────────────────────────────

export interface AgeGenderRate {
  male: number;
  female: number;
}

/** Hair loss prevalence by 5-year age cohort. Values are proportions (0–1). */
export const HAIR_LOSS_PREVALENCE: Record<string, AgeGenderRate> = {
  "20-24": { male: 0.05,  female: 0.005 },
  "25-29": { male: 0.20,  female: 0.02  },
  "30-34": { male: 0.20,  female: 0.02  },
  "35-39": { male: 0.30,  female: 0.15  },
  "40-44": { male: 0.30,  female: 0.20  },
  "45-49": { male: 0.45,  female: 0.22  },
  "50-54": { male: 0.45,  female: 0.25  },
  "55-59": { male: 0.50,  female: 0.30  },
  "60-64": { male: 0.50,  female: 0.40  },
  "65-69": { male: 0.55,  female: 0.45  },
  "70-74": { male: 0.60,  female: 0.50  },
  "75-79": { male: 0.70,  female: 0.55  },
  "80-84": { male: 0.75,  female: 0.60  },
  "85+":   { male: 1.00,  female: 0.60  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Income Band Affordability Base Rates
// ─────────────────────────────────────────────────────────────────────────────

export interface IncomeBandConfig {
  /** Human-readable label */
  label: string;
  /** Minimum annual household income (inclusive) */
  minIncome: number;
  /** Maximum annual household income (exclusive; Infinity for top band) */
  maxIncome: number;
  /** Annual income midpoint used in housing cost adjustment formula */
  midpointIncome: number;
  /** Base affordability rate before housing cost adjustment (0–1) */
  baseRate: number;
  /** Whether financing take-up rate applies to this band */
  financingApplies: boolean;
  /** Census ACS B19001 variable codes that map to this band */
  acsVariables: string[];
}

export const INCOME_BANDS: IncomeBandConfig[] = [
  {
    label: "$60K–$74,999",
    minIncome: 60_000,
    maxIncome: 75_000,
    midpointIncome: 67_500,
    baseRate: 0.04,
    financingApplies: true,
    acsVariables: ["B19001_012E"],
  },
  {
    label: "$75K–$99,999",
    minIncome: 75_000,
    maxIncome: 100_000,
    midpointIncome: 87_500,
    baseRate: 0.18,
    financingApplies: true,
    acsVariables: ["B19001_013E"],
  },
  {
    label: "$100K–$149,999",
    minIncome: 100_000,
    maxIncome: 150_000,
    midpointIncome: 125_000,
    baseRate: 0.30,
    financingApplies: false,
    acsVariables: ["B19001_014E", "B19001_015E"],
  },
  {
    label: "$150K–$199,999",
    minIncome: 150_000,
    maxIncome: 200_000,
    midpointIncome: 175_000,
    baseRate: 0.55,
    financingApplies: false,
    acsVariables: ["B19001_016E"],
  },
  {
    label: "$200K+",
    minIncome: 200_000,
    maxIncome: Infinity,
    midpointIncome: 275_000,
    baseRate: 0.87,
    financingApplies: false,
    acsVariables: ["B19001_017E"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Financing Take-Up Rate
// Applied to income bands where financingApplies = true ($60K–$99K)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Conservative financing take-up rate.
 * Assumption to be refined with CRM close data after 6 months of live deals.
 */
export const FINANCING_TAKEUP_RATE = 0.70;

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Payment Anchor & Affordability Ratio
// ─────────────────────────────────────────────────────────────────────────────

/** Monthly payment GetHairMD proposes for financed territories (USD). */
export const MONTHLY_PAYMENT_ANCHOR = 175;

/** Elective health spending as a proportion of monthly discretionary income. */
export const AFFORDABILITY_RATIO = 0.08;

// ─────────────────────────────────────────────────────────────────────────────
// Drive-Time Boundaries (Mapbox Isochrone API)
// ─────────────────────────────────────────────────────────────────────────────

/** Primary territory boundary — addressable market formula uses this polygon. */
export const DRIVE_TIME_PRIMARY_MINUTES = 30;

/** Outer ring — displayed on proposal map but excluded from formula. */
export const DRIVE_TIME_OUTER_MINUTES = 45;

// ─────────────────────────────────────────────────────────────────────────────
// Census ACS Table References
// ─────────────────────────────────────────────────────────────────────────────

export const CENSUS_ACS_TABLES = {
  AGE_SEX:           "B01001",
  HOUSEHOLD_INCOME:  "B19001",
} as const;

/** Cache Census API responses for this many days before refreshing. */
export const CENSUS_CACHE_TTL_DAYS = 90;

/**
 * ACS 5-year vintage used for all public-source pulls (income screen etc.).
 * "Latest available" per the formula-v2 spec. Bump when a newer 5-year release
 * is confirmed live on the Census API (endpoint: /data/{vintage}/acs/acs5).
 */
export const CENSUS_ACS5_VINTAGE = 2023;

// ─────────────────────────────────────────────────────────────────────────────
// Income Screen — Affordability Anchor V2 (decision_log #37)
// U.S. Bank Avvance: $8,500 @ 24.99% APR / 60 mo → $249.44/mo.
// 8% PTI  → $37,415 required annual HH income (shipping qualification threshold).
// 5% PTI  → $59,865 required annual HH income (robustness bound — flag, never filter).
// Qualification is computed from ACS B19001 (household income) at ZCTA level, with
// linear interpolation in the single straddling bracket only.
// ─────────────────────────────────────────────────────────────────────────────

/** Annual HH income required at 8% PTI. Shipping income-qualification threshold. */
export const INCOME_QUALIFY_THRESHOLD_ANNUAL = 37_415;

/** Annual HH income required at 5% PTI. Robustness bound — used for the flag, never to filter. */
export const INCOME_ROBUSTNESS_THRESHOLD_ANNUAL = 59_865;

/**
 * Robustness-flag rule. A ZCTA is flagged when the majority of its 8%-PTI-qualified
 * households would fall out under the stricter 5%-PTI bound — i.e. its qualification
 * leans on the $37,415–$59,865 gray zone and is sensitive to the PTI assumption.
 *
 *   robustness_flag = share_5pti > 0 ? (share_5pti / share_8pti) < FLOOR : (share_8pti > 0)
 *
 * The flag is advisory ONLY — it never removes a ZCTA from the addressable pool.
 * Default 0.5 (majority). Tunable; confirm the exact cutoff with Trace.
 */
export const ROBUSTNESS_SHARE_RATIO_FLOOR = 0.5;

export const B19001_TOTAL_HH_VAR = "B19001_001E";

export interface IncomeBracket {
  /** ACS B19001 variable code (estimate). */
  variable: string;
  /** Inclusive lower bound of the bracket (annual HH income, USD). */
  lower: number;
  /** Exclusive upper bound of the bracket; Infinity for the open top band. */
  upper: number;
}

/**
 * ACS Table B19001 household-income brackets, in order. Boundaries are the true
 * Census bracket edges — used for linear interpolation of the straddling bracket.
 */
export const B19001_INCOME_BRACKETS: IncomeBracket[] = [
  { variable: "B19001_002E", lower: 0,       upper: 10_000 },
  { variable: "B19001_003E", lower: 10_000,  upper: 15_000 },
  { variable: "B19001_004E", lower: 15_000,  upper: 20_000 },
  { variable: "B19001_005E", lower: 20_000,  upper: 25_000 },
  { variable: "B19001_006E", lower: 25_000,  upper: 30_000 },
  { variable: "B19001_007E", lower: 30_000,  upper: 35_000 },
  { variable: "B19001_008E", lower: 35_000,  upper: 40_000 },
  { variable: "B19001_009E", lower: 40_000,  upper: 45_000 },
  { variable: "B19001_010E", lower: 45_000,  upper: 50_000 },
  { variable: "B19001_011E", lower: 50_000,  upper: 60_000 },
  { variable: "B19001_012E", lower: 60_000,  upper: 75_000 },
  { variable: "B19001_013E", lower: 75_000,  upper: 100_000 },
  { variable: "B19001_014E", lower: 100_000, upper: 125_000 },
  { variable: "B19001_015E", lower: 125_000, upper: 150_000 },
  { variable: "B19001_016E", lower: 150_000, upper: 200_000 },
  { variable: "B19001_017E", lower: 200_000, upper: Infinity },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 1 Validation Targets
// ─────────────────────────────────────────────────────────────────────────────

export const VALIDATION_TARGETS = {
  /** Known addressable market from Dr. Sean Paul (Austin Westlake) proposal. */
  AUSTIN_WESTLAKE_BASELINE: 5_483,
  /** ±15% — Sprint 1 pass threshold. */
  AUSTIN_TOLERANCE_PCT: 0.15,
  /** ±25% — pause-and-audit threshold; do not auto-adjust constants to hit target. */
  AUSTIN_PAUSE_THRESHOLD_PCT: 0.25,
  /** Expected output floor for any healthy territory. */
  TERRITORY_RANGE_MIN: 3_000,
  /** Expected output ceiling for any healthy territory. */
  TERRITORY_RANGE_MAX: 5_000,
} as const;
