/**
 * v3 territory display model — pure, UI-agnostic logic shared by the territory detail
 * page (src/app/(app)/territories/[id]) and the Lead-profile artifact (src/app/(app)/prospects/[id]).
 *
 * Decisions this encodes (brief citing ops.decision_log #102, Trace rulings 2026-07-08):
 *   • The display "kind" (what number/map a viewer sees) depends ONLY on the persisted
 *     territory row — never on job state or viewer role. A v3 resize therefore never
 *     interrupts what a rep already sees; the swap to the approved v3 view happens only
 *     at approval (when formula_version flips to 3 and a boundary is saved).
 *   • Executive-only sizing/approve controls are layered on top of this base display by
 *     the page; they do not change the kind.
 *   • Drive-time minutes are a backend parameter — this module reads them off a job result
 *     for provenance but no consumer renders them on a v3 surface (AC2).
 *   • §D Lead-profile artifact resolves its territory via deals.territory_id
 *     (reserved_for is a dead column today — kept only to flag a data disagreement).
 */

import { V3_MIN_ADDRESSABLE_FLOOR, CENSUS_CACHE_TTL_DAYS } from '../../../lib/addressable-market-constants'

export type ViewerDesignation = 'executive' | 'rep' | null

// ─────────────────────────────────────────────────────────────────────────────
// V2 census-refresh guard (protects qa_locked anchors from render-time overwrite)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal territory shape the V2_LEGACY census-refresh decision depends on. */
export interface CensusRefreshInput {
  /** Protected QA/reference fixture flag. When true, the row must never be recomputed/overwritten. */
  qa_locked: boolean | null
  /** Last census fetch timestamp (ISO); null means never fetched (treated as stale). */
  census_fetched_at: string | null
  center_lat: number | string | null
  center_lng: number | string | null
}

/**
 * Whether the V2_LEGACY territory detail render should recompute + PERSIST county census
 * data for this territory (an admin-client write to `territories`). Returns FALSE — i.e. the
 * render leaves the row untouched — when:
 *   • `qa_locked` is true — protected #94 reference anchors must never be overwritten by a
 *     render side-effect (the 2026-07-10 Nashville incident: a stale-cache render clobbered
 *     the locked 4,127 figure with a whole-county 172,275 recompute). This is the guard.
 *   • the census cache is still fresh (< CENSUS_CACHE_TTL_DAYS old, Rule 5), or
 *   • the territory has no usable center coordinates to size around.
 *
 * Pure + clock-injectable so the guard is unit-testable without a live render.
 */
export function shouldRefreshV2Census(
  t: CensusRefreshInput,
  now: number = Date.now(),
  ttlDays: number = CENSUS_CACHE_TTL_DAYS,
): boolean {
  if (t.qa_locked) return false
  if (t.center_lat == null || t.center_lng == null) return false
  const cacheExpiresAt = t.census_fetched_at
    ? new Date(t.census_fetched_at).getTime() + ttlDays * 86_400_000
    : 0
  return now > cacheExpiresAt
}

/** Minimal territory shape the display kind depends on. */
export interface TerritoryDisplayInput {
  formula_version: number | null
  boundary_geojson: unknown | null
  addressable_patients_primary: number | null
}

/**
 * What the number/map area shows, independent of viewer role and job state:
 *   • APPROVED_V3    — a saved v3 drive-time boundary (formula_version=3 + boundary).
 *                      Addressable-vs-floor headline + single-ring boundary map, no minutes.
 *   • V2_LEGACY      — the existing ZCTA/county display (unchanged — AC7). Shown whenever a
 *                      persisted number exists and there is no approved v3 boundary yet.
 *   • PENDING_REVIEW — no persisted number and no approved boundary (a not-yet-sized
 *                      territory). Reps see "pending internal review"; execs see the sizing
 *                      workflow.
 */
export type TerritoryDisplayKind = 'APPROVED_V3' | 'V2_LEGACY' | 'PENDING_REVIEW'

export function resolveTerritoryDisplayKind(t: TerritoryDisplayInput): TerritoryDisplayKind {
  const hasApprovedV3 = t.formula_version === 3 && t.boundary_geojson != null
  if (hasApprovedV3) return 'APPROVED_V3'
  if (t.addressable_patients_primary != null) return 'V2_LEGACY'
  return 'PENDING_REVIEW'
}

// ─────────────────────────────────────────────────────────────────────────────
// Addressable-vs-floor (the v3 headline everywhere a v3 result appears — AC2)
// ─────────────────────────────────────────────────────────────────────────────

export interface FloorStatus {
  /** Rounded, non-negative addressable households. */
  addressable: number
  /** The v3 minimum addressable floor (18,600). */
  floor: number
  /** Whether addressable clears the floor. */
  clears: boolean
  /** addressable − floor (may be negative). */
  delta: number
}

export function addressableFloorStatus(
  addressable: number,
  floor: number = V3_MIN_ADDRESSABLE_FLOOR,
): FloorStatus {
  const a = Math.max(0, Math.round(addressable))
  return { addressable: a, floor, clears: a >= floor, delta: a - floor }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sizing job result parsing (the job row's `result` jsonb → typed, UI-ready shape)
// ─────────────────────────────────────────────────────────────────────────────

export type SizingResultStatus = 'VIABLE' | 'UNRESOLVED_BELOW_THRESHOLD_AT_CEILING'

export interface ParsedSizingResult {
  status: SizingResultStatus
  /** VIABLE: addressable at the chosen minute; UNRESOLVED: best achieved (< floor). */
  addressable: number
  /** VIABLE: the chosen drive-time minute (backend-only, never rendered); UNRESOLVED: null. */
  minutes: number | null
  /** VIABLE: the sized isochrone boundary feature; UNRESOLVED: null (no viable boundary). */
  boundaryFeature: GeoJSON.Feature | null
}

/**
 * Parse the `territory_sizing_jobs.result` payload written by runSizingJob
 * ({ result: V3SizingResult, sizedContour, provenance }). Returns null for any shape that
 * is not a recognizable terminal result, so callers fail closed rather than render garbage.
 */
export function parseSizingJobResult(raw: unknown): ParsedSizingResult | null {
  if (!raw || typeof raw !== 'object') return null
  const result = (raw as { result?: unknown }).result
  if (!result || typeof result !== 'object') return null
  const status = (result as { status?: unknown }).status

  if (status === 'VIABLE') {
    const addressable = Number((result as { addressable?: unknown }).addressable)
    const minutes = Number((result as { minutes?: unknown }).minutes)
    if (!Number.isFinite(addressable)) return null
    const sizedContour = (raw as { sizedContour?: unknown }).sizedContour
    const polygon =
      sizedContour && typeof sizedContour === 'object'
        ? (sizedContour as { polygon?: unknown }).polygon
        : null
    const boundaryFeature =
      polygon && typeof polygon === 'object' ? (polygon as GeoJSON.Feature) : null
    return {
      status: 'VIABLE',
      addressable,
      minutes: Number.isFinite(minutes) ? minutes : null,
      boundaryFeature,
    }
  }

  if (status === 'UNRESOLVED_BELOW_THRESHOLD_AT_CEILING') {
    const best = Number((result as { bestAddressable?: unknown }).bestAddressable)
    return {
      status: 'UNRESOLVED_BELOW_THRESHOLD_AT_CEILING',
      addressable: Number.isFinite(best) ? best : 0,
      minutes: null,
      boundaryFeature: null,
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// §D — prospect → territory link resolution (deals.territory_id authoritative)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProspectTerritoryLinks {
  /** territories.id where reserved_for = prospect.id. Dead column today (always null). */
  reservedForTerritoryId: string | null
  /** territory_id of the prospect's most-recent deal — the authoritative link. */
  latestDealTerritoryId: string | null
}

export interface ProspectTerritoryResolution {
  territoryId: string | null
  source: 'deal' | 'reserved_for' | null
  /** True when reserved_for is populated AND disagrees with the deal link — a data anomaly to flag. */
  disagree: boolean
}

/**
 * Resolve which territory a prospect's Lead profile should surface. deals.territory_id is
 * authoritative (reserved_for is unpopulated across the table — see decision to treat it as
 * a future cleanup candidate). `disagree` is surfaced so a future reserved_for population
 * that contradicts the deal link is flagged rather than silently ignored (AC8).
 */
export function resolveProspectTerritory(
  links: ProspectTerritoryLinks,
): ProspectTerritoryResolution {
  const { reservedForTerritoryId, latestDealTerritoryId } = links
  const disagree =
    reservedForTerritoryId != null &&
    latestDealTerritoryId != null &&
    reservedForTerritoryId !== latestDealTerritoryId
  const territoryId = latestDealTerritoryId ?? null
  return { territoryId, source: territoryId != null ? 'deal' : null, disagree }
}
