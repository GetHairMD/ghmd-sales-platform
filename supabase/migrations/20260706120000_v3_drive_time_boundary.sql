-- v3 Drive-Time Territory Boundary — schema foundation (PR-A)
--
-- Backs the v3 drive-time sizing engine per docs/TERRITORY-METHODOLOGY.md §8 and
-- docs/V3-DRIVE-TIME-SCOPING.md §2.4. Authorization: ops.decision_log #89.
--
-- This migration is ADDITIVE and behavior-preserving for existing rows:
--   * formula_version defaults to 2 (ZCTA/county v2) so the 3 existing territories
--     keep v2 behavior untouched. 3 = drive-time (v3), set only when a territory is
--     authored/re-sized under v3 (a future, Trace-controlled action — never automatic).
--   * All boundary_* columns are nullable and start NULL on existing rows.
--
-- RLS: NO new policy. These columns inherit the existing public.territories RLS
-- posture as-is. This migration deliberately does not touch any RLS policy.

-- ─────────────────────────────────────────────────────────────────────────────
-- PostGIS (decision #89 flag 1 — approved). Needed for ST_Area/ST_Intersection/
-- ST_Difference/ST_MakeValid and GiST spatial indexing of territory boundaries.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────────────────────
-- Boundary columns on territories. SRID 4326 (WGS84 lat/lng) matches Mapbox
-- Isochrone output; area math casts to geography / uses an equal-area projection.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.territories
  ADD COLUMN IF NOT EXISTS formula_version    smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS boundary_geom      geometry(MultiPolygon, 4326),
  ADD COLUMN IF NOT EXISTS boundary_geojson   jsonb,
  ADD COLUMN IF NOT EXISTS boundary_minutes   integer,
  ADD COLUMN IF NOT EXISTS boundary_source    jsonb,
  ADD COLUMN IF NOT EXISTS sold_boundary_geom geometry(MultiPolygon, 4326);

COMMENT ON COLUMN public.territories.formula_version IS
  '2 = ZCTA/county addressable (v2, default); 3 = drive-time isochrone (v3). Existing rows stay 2 — never auto-migrated (methodology §7).';
COMMENT ON COLUMN public.territories.boundary_geom IS
  'v3 sized drive-time boundary (MultiPolygon, SRID 4326). Current sizing output; may be re-derived pre-sale. NULL for v2 rows.';
COMMENT ON COLUMN public.territories.boundary_geojson IS
  'GeoJSON copy of boundary_geom for client map render + turf fallback. NULL for v2 rows.';
COMMENT ON COLUMN public.territories.boundary_minutes IS
  'Drive-time (minutes, <= V3_MAX_DRIVE_MINUTES=45) that produced boundary_geom. NULL for v2 rows.';
COMMENT ON COLUMN public.territories.boundary_source IS
  'Provenance jsonb: {mapbox_profile, denoise, generalize, contours_probed, isochrone_fetched_at, ...}. NULL for v2 rows.';
COMMENT ON COLUMN public.territories.sold_boundary_geom IS
  'FROZEN exclusivity boundary written once at close, never recomputed (methodology §8.4 / scoping §4.2). Basis for first-sold overlap precedence. NULL until sold under v3.';

-- ─────────────────────────────────────────────────────────────────────────────
-- GiST spatial indexes for area/intersection/difference and the sold-area union.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS territories_boundary_geom_gix
  ON public.territories USING gist (boundary_geom);
CREATE INDEX IF NOT EXISTS territories_sold_boundary_geom_gix
  ON public.territories USING gist (sold_boundary_geom);
