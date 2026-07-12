-- Exclude draft territories from the National Status Map (decision this session,
-- 2026-07-11; extends #121 / #122 / #132).
--
-- Context: the territory-creation entry point (feature/territory-creation-topbar-actions)
-- introduces status='draft' rows — a territory an executive is actively scoping that has
-- not yet been sized or approved. territory_status_map() previously derived status for
-- every non-sold, non-pipeline row as 'available', so a brand-new draft would surface on
-- the national map as an available (green) territory before it is real. Per Trace's
-- decision, drafts must NOT appear on the national map at all.
--
-- Change: CREATE OR REPLACE the function to add `t.status is distinct from 'draft'` to the
-- WHERE clause (IS DISTINCT FROM so NULL status — the historical default — is still kept).
-- EVERYTHING ELSE is byte-for-byte the prior definition: the SECURITY DEFINER + pinned
-- search_path, the boundary_geojson properties-stripping leak fix (do not regress — the RPC
-- payload is Network-tab-visible), the stage>=6 in_pipeline derivation, sold_to_name
-- gating, and the internal_users membership gate. No new RLS surface (still internal_users
-- read-wide on territories; prospects RLS untouched).

create or replace function public.territory_status_map()
returns table (
  id uuid,
  name text,
  center_lat numeric,
  center_lng numeric,
  boundary_geojson jsonb,
  status text,        -- 'sold' | 'in_pipeline' | 'available'
  sold_to_name text   -- non-null ONLY when status = 'sold'
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.name,
    t.center_lat,
    t.center_lng,
    -- Normalize boundary_geojson to a BARE GEOMETRY (or null), stripping any GeoJSON
    -- `properties` BEFORE they cross the wire. This is a leak fix, not cosmetics: the
    -- RPC response is visible in the browser Network tab, so a stored Feature /
    -- FeatureCollection carrying `properties` (Mapbox isochrone features do) would
    -- expose them regardless of what the client draws. No branch selects a `properties`
    -- key. FeatureCollection -> GeometryCollection preserves EVERY feature (no
    -- first-feature truncation); the fallback validates the geometry type (allow-list
    -- mirrors the client) so malformed input becomes null and the client shows a marker.
    case
      when t.boundary_geojson->>'type' = 'Feature'
        then t.boundary_geojson->'geometry'
      when t.boundary_geojson->>'type' = 'FeatureCollection'
        then (
          select jsonb_build_object(
            'type', 'GeometryCollection',
            'geometries', jsonb_agg(feat->'geometry')
          )
          from jsonb_array_elements(t.boundary_geojson->'features') as feat
        )
      when t.boundary_geojson->>'type' in (
        'Point','MultiPoint','LineString','MultiLineString',
        'Polygon','MultiPolygon','GeometryCollection'
      ) then t.boundary_geojson
      else null
    end as boundary_geojson,
    case
      when t.status = 'sold' then 'sold'
      when p.stage >= 6 then 'in_pipeline'  -- 6 == STAGE.PROPOSAL_SENT (pipeline-stages.ts; pinned by test)
      else 'available'
    end as status,
    case when t.status = 'sold' then p.full_name else null end as sold_to_name
  from public.territories t
  left join public.prospects p on p.id = t.prospect_id
  where t.status is distinct from 'draft'          -- NEW: drafts are not yet real; hide from the map
    and exists (
      select 1 from public.internal_users iu where iu.user_id = auth.uid()
    );
$$;

-- Re-assert grants (belt-and-braces house style; CREATE OR REPLACE preserves ACLs but we
-- restate intent): strip default PUBLIC, grant EXECUTE to authenticated only, never anon.
revoke all on function public.territory_status_map() from public, anon, authenticated;
grant execute on function public.territory_status_map() to authenticated;

comment on function public.territory_status_map() is
  'National territory status projection for /national-map (decision #132, draft-exclusion '
  '2026-07-11). SECURITY DEFINER with pinned search_path=public: derives sold | in_pipeline '
  '| available across ALL reps'' prospects without exposing any prospects row. Excludes '
  'status=''draft'' rows (unsized/unapproved territories being scoped). Gated on '
  'internal_users membership (any internal user, rep or executive); EXECUTE granted to '
  'authenticated only, never anon. sold_to_name is non-null only for sold rows. '
  'boundary_geojson is normalized to a bare geometry with all GeoJSON properties stripped, '
  'so no property blob crosses the (Network-tab-visible) wire.';
