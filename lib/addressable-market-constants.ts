/**
 * Addressable Market Formula Constants
 *
 * Single source of truth for all territory analysis calculations.
 * Never hardcode these values inline in Edge Functions or components.
 * All values locked as of Build Spec v1.0 — changes require Trace approval.
 *
 * NOTE: hair-loss prevalence (HAIR_LOSS_PREVALENCE / AgeGenderRate) was REMOVED from
 * this file and archived to /reference — the v2 methodology is affordability-only
 * (addressable = households × income × credit, no prevalence). See decision_log
 * "Addressable Market Formula Corrected — Prevalence Term Removed".
 */

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
 * "Latest available" per the formula-v2 spec: the 2020–2024 ACS 5-year estimates
 * (vintage 2024) were publicly released 2026-01-29 and are the current latest
 * 5-year dataset. Endpoint: /data/{vintage}/acs/acs5. Bump when a newer 5-year
 * release is confirmed live on the Census API.
 */
export const CENSUS_ACS5_VINTAGE = 2024;

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
// Credit Screen — Experian FICO≥670 credit-qualified share (Task C)
// Source: Experian, September 2025. Per-state overrides live in
// /data/experian-credit-share-by-state.json; the national figure is the fallback
// for any state without an override.
// ─────────────────────────────────────────────────────────────────────────────

/** FICO score at/above which a household is treated as credit-qualified (prime+). */
export const EXPERIAN_FICO_PRIME_THRESHOLD = 670;

/** National share of consumers with FICO ≥ 670 (Experian, Sept 2025). Fallback share. */
export const EXPERIAN_NATIONAL_CREDIT_SHARE = 0.704;

// ─────────────────────────────────────────────────────────────────────────────
// Customers Needed (Task E)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Customers a territory must be able to yield to be viable. Locked 2026-07-03
 * (worst-case Early-tier recovery). A territory is sized so that
 * addressable × penetration ≥ CUSTOMERS_NEEDED.
 */
export const CUSTOMERS_NEEDED = 62;

// ─────────────────────────────────────────────────────────────────────────────
// Penetration Scenarios (Task F)
// Base 1% is a DOCUMENTED PLACEHOLDER shipping Monday; low/high bound the
// sensitivity. Empirical replacement comes from QuickBooks reorder data
// (~2 weeks post-launch) — see decision_log #40 (Penetration Bridge).
// ─────────────────────────────────────────────────────────────────────────────

export const PENETRATION_RATE_LOW = 0.005;
export const PENETRATION_RATE_BASE = 0.01;
export const PENETRATION_RATE_HIGH = 0.02;

/** Provenance for the base penetration rate — surfaced in proposal output. */
export const PENETRATION_SOURCE =
  "1% base rate is a documented placeholder (locked 2026-07-03), shown with 0.5% / 2% " +
  "sensitivity bounds. Empirical replacement from QuickBooks reorder data ETA ~2 weeks " +
  "post-launch (decision_log #40, Penetration Bridge).";

export interface PenetrationScenario {
  key: "low" | "base" | "high";
  label: string;
  rate: number;
}

/** The three penetration scenarios shown on every proposal, low → high. */
export const PENETRATION_SCENARIOS: PenetrationScenario[] = [
  { key: "low",  label: "Conservative (0.5%)", rate: PENETRATION_RATE_LOW },
  { key: "base", label: "Base (1%)",           rate: PENETRATION_RATE_BASE },
  { key: "high", label: "Optimistic (2%)",     rate: PENETRATION_RATE_HIGH },
];

// ─────────────────────────────────────────────────────────────────────────────
// v3 Drive-Time Sizing Engine (decision_log #89)
//
// ADDITIVE ONLY. These constants back the drive-time isochrone sizing engine
// (docs/TERRITORY-METHODOLOGY.md §8, docs/V3-DRIVE-TIME-SCOPING.md §3.3). They do
// NOT modify or replace any v2 constant above — v2 territories keep their existing
// behavior (formula_version = 2). v3 is a parallel, opt-in path.
//
// Sizing rule (§8.3): expand the drive-time isochrone from the practice location
// until the addressable households inside it (after income + credit qualification)
// clear a minimum viable customer count, anchored at the Conservative 0.5%
// penetration rate:
//
//   minimum viable customers = CUSTOMERS_NEEDED (62) × V3_VIABILITY_BUFFER (1.5) = 93
//   minimum addressable floor = 93 ÷ PENETRATION_RATE_LOW (0.005)              = 18,600
//
// The smallest drive-time (integer minutes, capped at 45) that clears the floor is
// the territory boundary. If even the 45-minute ceiling falls short, the engine
// returns a typed UNRESOLVED result — never a 45-minute boundary presented as viable.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Viability buffer multiplier applied over CUSTOMERS_NEEDED for v3 sizing.
 * DECIDED, provisional (§8.3): a starting value confirmed by Trace, not empirically
 * derived. Carries an explicit recalibration trigger — revisit after the first cohort
 * of v3-sized territories has real conversion data, adjust via PR + ops.decision_log.
 */
export const V3_VIABILITY_BUFFER = 1.5;

/**
 * Minimum viable customers a v3 territory must be able to yield.
 * = CUSTOMERS_NEEDED (62) × V3_VIABILITY_BUFFER (1.5) = 93.
 */
export const V3_MIN_VIABLE_CUSTOMERS = 93;

/**
 * Minimum addressable (qualified) households a v3 isochrone must contain.
 * = V3_MIN_VIABLE_CUSTOMERS (93) ÷ PENETRATION_RATE_LOW (0.5%) = 18,600.
 * The smallest drive-time isochrone that clears this floor is the boundary.
 */
export const V3_MIN_ADDRESSABLE_FLOOR = 18_600;

/**
 * Hard maximum drive-time (minutes) for any v3 territory boundary (§8.3).
 * No boundary expands beyond a 45-minute isochrone, whether or not the viability
 * threshold has been cleared. Sits inside Mapbox's own 60-min/contour cap.
 */
export const V3_MAX_DRIVE_MINUTES = 45;

/**
 * Hard MINIMUM drive-time (minutes) for any v3 territory boundary (§8.5, decision #120).
 * Removing the old 15-minute search floor (#102) made single-digit-minute radii reachable
 * in dense metros; this clamps the *returned boundary* up to 5 minutes when the smallest
 * qualifying drive-time m* falls below it — the territory is re-evaluated at 5 minutes and
 * carries that (larger) addressable count, never the smaller technically-sufficient one.
 *
 * Distinct from V3_MIN_ADDRESSABLE_FLOOR: that is a household COUNT the isochrone must
 * clear; this is a MINUTE count the returned radius may not fall below. They are not
 * interchangeable and are never conflated in the search logic.
 */
export const V3_MIN_DRIVE_MINUTES = 5;

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
