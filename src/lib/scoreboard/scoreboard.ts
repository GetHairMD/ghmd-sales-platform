/**
 * Scoreboard domain logic (E-1) — the pure functions the /scoreboard page composes
 * over the aggregate rows returned by the `scoreboard_summary()` RPC.
 *
 * pipeline_value = active-pipeline count × the $179,000 territory price is computed
 * HERE (not in SQL): the price is a single-source constant (TERRITORY_STANDARD_PRICE,
 * CLAUDE.md "never hardcode the price inline") and SQL cannot import a TS constant, so
 * multiplying here keeps the money figure single-sourced instead of duplicating $179K
 * into the migration.
 *
 * current_streak is now computed IN SQL inside scoreboard_summary() (follow-up #2):
 * returning the raw close-months array to a shared leaderboard leaked peer deal-timing,
 * so the RPC returns only a streak NUMBER. `computeCurrentStreak` below is retained
 * ONLY as a TEST-ONLY REFERENCE IMPLEMENTATION of the streak semantics — it is NOT
 * called by any live path; the live rolled-back adversarial proof is the source of
 * truth for the SQL behaviour it mirrors.
 */

// Relative (not '@/') import: this module is imported directly by vitest, which has
// no path-alias resolution configured. TERRITORY_STANDARD_PRICE is the single source
// for the $179K territory price (CLAUDE.md Key Reference Value) — never inline it.
import { TERRITORY_STANDARD_PRICE } from '../../components/proposal/constants'

/**
 * One row of the `scoreboard_summary()` RPC — mirrors the SQL RETURNS TABLE shape.
 * `current_streak` is computed in SQL (no month-level detail crosses the boundary).
 */
export interface ScoreboardSummaryRow {
  rep_id: string
  rep_name: string
  deals_closed_count: number
  active_pipeline_count: number
  proposal_engagement_score: number
  current_streak: number
}

/** View-model row the leaderboard UI renders (camelCase, computed figures resolved). */
export interface ScoreboardRow {
  repId: string
  repName: string
  dealsClosed: number
  pipelineValue: number
  proposalEngagement: number
  currentStreak: number
}

/** Sort keys the table header exposes. */
export type ScoreboardSortKey =
  | 'dealsClosed'
  | 'pipelineValue'
  | 'proposalEngagement'
  | 'currentStreak'
  | 'repName'

/**
 * 'YYYY-MM' month key for a Date, in UTC — matches `scoreboard_summary()`'s
 * `to_char(funded_won_at at time zone 'UTC', 'YYYY-MM')`, so the TS streak walk and
 * the SQL close-month buckets agree on the same calendar-month boundaries.
 */
export function monthKey(d: Date): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1 // getUTCMonth is 0-based
  return `${y}-${String(m).padStart(2, '0')}`
}

/** The current UTC month key. `now` is injectable so tests are deterministic. */
export function currentMonthKey(now: Date = new Date()): string {
  return monthKey(now)
}

/** The 'YYYY-MM' key one calendar month before `key` (wraps the year at January). */
export function previousMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return m <= 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * pipeline_value — active-pipeline deal count × the single-source territory price.
 * Never inline the price; it comes from TERRITORY_STANDARD_PRICE.
 */
export function computePipelineValue(activePipelineCount: number): number {
  return activePipelineCount * TERRITORY_STANDARD_PRICE
}

/**
 * current_streak — TEST-ONLY REFERENCE IMPLEMENTATION.
 *
 * The live streak is computed in SQL inside scoreboard_summary() (follow-up #2). This
 * function is NOT called by any production path; it exists so the streak semantics are
 * pinned by fast unit tests at every calendar boundary, mirroring what the SQL does.
 * (There is a small drift risk between this and the SQL version — the SQL is the source
 * of truth, re-proven live by the rolled-back adversarial test.)
 *
 * Semantics: the number of CONSECUTIVE calendar months, walking back from and INCLUDING
 * `referenceMonth`, in which the rep had >= 1 close. If the rep has no close in the
 * reference (current) month the streak is 0 — the run must be anchored at the current
 * month. The first gap stops the walk. Duplicate/unordered keys are handled (Set).
 *
 * Examples (referenceMonth = '2026-07'):
 *   ['2026-07','2026-06']            -> 2   (07, 06 consecutive)
 *   ['2026-07','2026-06','2026-04']  -> 2   (05 gap stops the walk)
 *   ['2026-06']                      -> 0   (current month absent)
 *   ['2026-01','2025-12']            -> 0   (neither is the current month)
 *   []                               -> 0
 */
export function computeCurrentStreak(
  closeMonths: string[],
  referenceMonth: string = currentMonthKey(),
): number {
  const months = new Set(closeMonths)
  let streak = 0
  let cursor = referenceMonth
  while (months.has(cursor)) {
    streak += 1
    cursor = previousMonthKey(cursor)
  }
  return streak
}

/**
 * Map one aggregate RPC row to the UI view-model. current_streak comes straight from
 * the RPC (computed in SQL); only pipeline_value is derived here (× the single-source
 * price), since SQL cannot import the TS constant.
 */
export function toScoreboardRow(raw: ScoreboardSummaryRow): ScoreboardRow {
  return {
    repId: raw.rep_id,
    // rep_name already carries the SQL-side NULL fallback ('Unnamed rep'); guard again
    // in case the RPC shape ever changes so the UI never renders an empty label.
    repName: raw.rep_name?.trim() ? raw.rep_name : 'Unnamed rep',
    dealsClosed: raw.deals_closed_count ?? 0,
    pipelineValue: computePipelineValue(raw.active_pipeline_count ?? 0),
    proposalEngagement: raw.proposal_engagement_score ?? 0,
    currentStreak: raw.current_streak ?? 0,
  }
}

/**
 * Rank rows for the leaderboard: deals closed desc, then pipeline value desc, then
 * name asc as a stable tiebreak. This is the default order (rank cards + initial table
 * sort); the table header can re-sort on any ScoreboardSortKey via `sortRows`.
 */
export function rankRows(rows: ScoreboardRow[]): ScoreboardRow[] {
  return [...rows].sort(
    (a, b) =>
      b.dealsClosed - a.dealsClosed ||
      b.pipelineValue - a.pipelineValue ||
      a.repName.localeCompare(b.repName),
  )
}

/** Sort rows by a column, ascending or descending, with a stable name tiebreak. */
export function sortRows(
  rows: ScoreboardRow[],
  key: ScoreboardSortKey,
  direction: 'asc' | 'desc',
): ScoreboardRow[] {
  const dir = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const cmp =
      key === 'repName'
        ? a.repName.localeCompare(b.repName)
        : (a[key] as number) - (b[key] as number)
    return cmp !== 0 ? cmp * dir : a.repName.localeCompare(b.repName)
  })
}

const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** "$358,000" — whole-dollar currency for the table cell. */
export function formatCurrency(n: number): string {
  return usdWhole.format(n)
}

/** "$1.2M" — compact currency for the rank cards, where space is tight. */
export function formatCurrencyCompact(n: number): string {
  return usdCompact.format(n)
}
