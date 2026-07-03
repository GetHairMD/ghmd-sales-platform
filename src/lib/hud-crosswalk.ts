/**
 * HUD USPS ZIP↔County Crosswalk — formula-v2-public-source, Task B.
 *
 * GEOGRAPHY JOIN ONLY. This layer associates ZIPs/ZCTAs with a territory's
 * geography (county / drive-time zone); it does NOT weight or allocate demand.
 *
 * HUD provides ZIP↔County (no ZCTA geography exists in the HUD crosswalk). We apply
 * the ZIP-as-ZCTA resolution: each ZIP is used directly as its ACS ZCTA5 for the
 * income screen's B19001 pull (see income-screen.ts, decision_log "HUD Crosswalk
 * Methodology"). So `zcta` equals `zip` in every row.
 *
 * Architecture: a static in-repo snapshot at /data/hud-usps-zip-county-crosswalk.json,
 * pulled from the HUD USER API (type=2, per-state). `res_ratio` is retained for Task G
 * cross-county allocation. See /data/README.md for the build procedure.
 */

export interface HudCrosswalkRow {
  /** 5-digit USPS ZIP code. */
  zip: string
  /** ZIP Code Tabulation Area this ZIP maps to (Census geography). */
  zcta: string
  /** 5-digit county FIPS (state+county), when present in the extract. */
  county_fips?: string
  /** HUD residential address ratio (share of ZIP's residential addresses in this row). */
  res_ratio?: number
}

export interface HudCrosswalkFile {
  provenance: {
    source: string
    dataset: string
    quarter: string
    downloaded_at: string | null
    url: string
    notes?: string
  }
  /** True until the full HUD extract has been dropped in (guards silent empty joins). */
  manual_download_required: boolean
  rows: HudCrosswalkRow[]
}

/**
 * Validate + normalize a parsed crosswalk file. Throws on structural problems so a
 * missing/placeholder file fails loudly rather than silently yielding empty joins.
 */
export function loadHudCrosswalk(parsed: unknown): HudCrosswalkFile {
  const file = parsed as HudCrosswalkFile
  if (!file || typeof file !== 'object' || !Array.isArray(file.rows)) {
    throw new Error('HUD crosswalk: malformed file (expected { provenance, rows: [] })')
  }
  return file
}

/**
 * Assert the crosswalk actually carries data before a pipeline run depends on it.
 * Call this from the territory/reconciliation path (Task G) — NOT from unit tests,
 * which pass their own fixtures.
 */
export function assertCrosswalkPopulated(file: HudCrosswalkFile): void {
  if (file.manual_download_required || file.rows.length === 0) {
    throw new Error(
      'HUD crosswalk not populated — re-run the HUD USER API pull into ' +
        '/data/hud-usps-zip-county-crosswalk.json (see /data/README.md).',
    )
  }
}

/** Unique ZCTAs whose ZIPs fall in the given county FIPS. Geography join only. */
export function zctasForCounty(rows: HudCrosswalkRow[], countyFips: string): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    if (r.county_fips === countyFips && r.zcta) set.add(r.zcta)
  }
  return Array.from(set).sort()
}

/** Unique ZCTAs associated with a set of ZIP codes. Geography join only. */
export function zctasForZips(rows: HudCrosswalkRow[], zips: string[]): string[] {
  const wanted = new Set(zips)
  const set = new Set<string>()
  for (const r of rows) {
    if (wanted.has(r.zip) && r.zcta) set.add(r.zcta)
  }
  return Array.from(set).sort()
}
