/**
 * HUD USPS ZIP Code Crosswalk — formula-v2-public-source, Task B.
 *
 * GEOGRAPHY JOIN ONLY. This layer associates ZIPs/ZCTAs with a territory's
 * geography (county / drive-time zone); it does NOT weight or allocate demand.
 * The income screen operates at ZCTA level (see income-screen.ts); this crosswalk
 * answers "which ZCTAs belong to this county/territory?".
 *
 * Architecture: a static in-repo file at /data/hud-usps-zip-crosswalk.json — NOT a
 * live API dependency. A manual one-time HUD download populates it (no API key,
 * no rotation). See /data/README.md for the download + provenance procedure.
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
      'HUD crosswalk not populated — drop the full HUD USPS ZIP→ZCTA extract into ' +
        '/data/hud-usps-zip-crosswalk.json (see /data/README.md). Manual one-time download.',
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
