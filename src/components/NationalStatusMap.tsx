'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Globe } from 'lucide-react'
import { palette } from '@/design/tokens'
import { createClient } from '@/lib/supabase/client'

/**
 * National Territory Status Map (decision #132). Read-only. Renders every territory
 * nationally, colored by status, for reps AND executives. Status is READ from the
 * territory_status_map() RPC — never computed client-side — so no prospect/rep/deal
 * detail is available on this surface for in_pipeline territories (only the words
 * "In Pipeline"). Follows the token-clean pattern in proposal/TerritoryMap.tsx:
 * colors come from `palette`, never a raw hex.
 */

/** One row of the territory_status_map() RPC — mirrors the SQL RETURNS TABLE shape. */
interface TerritoryStatusRow {
  id: string
  name: string | null
  center_lat: number | null
  center_lng: number | null
  /** GeoJSON boundary (Feature / FeatureCollection / bare geometry) or null. */
  boundary_geojson: unknown | null
  status: 'sold' | 'in_pipeline' | 'available'
  /** Populated by the RPC ONLY for sold rows; null otherwise. */
  sold_to_name: string | null
}

type Status = TerritoryStatusRow['status']

// Continental US extent — the map opens on the whole country, not fit-to-data (§4:
// "a 'look at the whole map' tool, not a single-territory zoom").
const US_BOUNDS: [[number, number], [number, number]] = [
  [-125.0, 24.0], // SW — southern tip of TX/FL
  [-66.5, 49.5], //  NE — Maine / northern border
]

// Marker color per status (a single-color pin can't do fill+outline). Available uses
// SHADOW — its outline color — because MIST (its fill) is near-white and invisible as
// a pin. Boundary polygons below use the full fill(MIST)/outline(SHADOW) scheme.
const MARKER_COLOR: Record<Status, string> = {
  sold: palette.success, //   #4CAF50
  in_pipeline: palette.sunlights, // #E5B36A
  available: palette.shadow, //     #544F54 (outline of the available scheme)
}

/**
 * Popup text — plain string set via Popup.setText (textContent, so no HTML injection
 * from a practice name). Only the words #132 permits: "Sold" (optionally the buyer's
 * name, explicitly allowed for sold) / "In Pipeline" (NEVER a name) / "Available".
 */
function popupText(row: TerritoryStatusRow): string {
  if (row.status === 'sold') return row.sold_to_name ? `Sold — ${row.sold_to_name}` : 'Sold'
  if (row.status === 'in_pipeline') return 'In Pipeline'
  return 'Available'
}

/** Extract a bare GeoJSON geometry from an unknown stored boundary value, or null. */
function toGeometry(value: unknown): GeoJSON.Geometry | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.type !== 'string') return null
  if (v.type === 'Feature') return toGeometry(v.geometry)
  if (v.type === 'FeatureCollection') {
    const feats = v.features
    if (Array.isArray(feats) && feats.length > 0) {
      return toGeometry((feats[0] as Record<string, unknown>)?.geometry)
    }
    return null
  }
  const GEOMETRY_TYPES = [
    'Point', 'MultiPoint', 'LineString', 'MultiLineString',
    'Polygon', 'MultiPolygon', 'GeometryCollection',
  ]
  return GEOMETRY_TYPES.includes(v.type) ? (value as GeoJSON.Geometry) : null
}

export default function NationalStatusMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const [rows, setRows] = useState<TerritoryStatusRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch the status projection once. Reads state, never computes it (gate is server-side).
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabase.rpc('territory_status_map').then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        setError(rpcError.message)
        return
      }
      setRows((data ?? []) as TerritoryStatusRow[])
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!token || !containerRef.current || rows === null) return
    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      bounds: US_BOUNDS,
      fitBoundsOptions: { padding: 24 },
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: true })

    map.on('load', () => {
      // Territories WITH a boundary → one source, data-driven paint by status.
      // The hexes still originate from `palette` (tokens) — mapbox paint just can't
      // consume Tailwind classes, which is the only reason a value appears here.
      const features = rows
        .map((r) => {
          const geometry = toGeometry(r.boundary_geojson)
          return geometry
            ? {
                type: 'Feature' as const,
                geometry,
                properties: { label: popupText(r), status: r.status },
              }
            : null
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)

      if (features.length > 0) {
        map.addSource('territories', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        })
        map.addLayer({
          id: 'territory-fill',
          type: 'fill',
          source: 'territories',
          paint: {
            'fill-color': [
              'match', ['get', 'status'],
              'sold', palette.success,
              'in_pipeline', palette.sunlights,
              /* available */ palette.mist,
            ],
            'fill-opacity': 0.35,
          },
        })
        map.addLayer({
          id: 'territory-line',
          type: 'line',
          source: 'territories',
          paint: {
            'line-color': [
              'match', ['get', 'status'],
              'sold', palette.success,
              'in_pipeline', palette.sunlights,
              /* available */ palette.shadow,
            ],
            'line-width': 1.5,
          },
        })
        map.on('click', 'territory-fill', (e) => {
          const f = e.features?.[0]
          if (!f) return
          popup.setLngLat(e.lngLat).setText(String(f.properties?.label ?? '')).addTo(map)
        })
        map.on('mouseenter', 'territory-fill', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'territory-fill', () => {
          map.getCanvas().style.cursor = ''
        })
      }

      // Territories WITHOUT a boundary (expected for most current data) → colored
      // point markers at their center, same status color, popup with the same text.
      for (const r of rows) {
        if (toGeometry(r.boundary_geojson)) continue
        if (r.center_lat == null || r.center_lng == null) continue
        new mapboxgl.Marker({ color: MARKER_COLOR[r.status] })
          .setLngLat([Number(r.center_lng), Number(r.center_lat)])
          .setPopup(new mapboxgl.Popup({ closeButton: false }).setText(popupText(r)))
          .addTo(map)
      }
    })

    return () => {
      popup.remove()
      map.remove()
    }
  }, [token, rows])

  if (!token) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-mist bg-bg-subtle">
        <Globe className="h-8 w-8 text-text-muted" aria-hidden="true" />
        <p className="font-heading text-sm uppercase tracking-caps text-text-muted">
          Map unavailable — Mapbox token not configured
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-text-muted">
          Could not load territory statuses. Try reloading.
        </p>
      )}
      <div
        ref={containerRef}
        className="h-[70vh] w-full overflow-hidden rounded-xl border border-mist shadow-sm"
      />
      <Legend />
    </div>
  )
}

/** Status legend. Swatch colors come from `palette` (inline style), never a raw hex. */
function Legend() {
  const items: { label: string; color: string }[] = [
    { label: 'Sold', color: palette.success },
    { label: 'In Pipeline', color: palette.sunlights },
    { label: 'Available', color: palette.shadow },
  ]
  return (
    <ul className="flex flex-wrap gap-4">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2 text-sm text-text-muted">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: it.color }}
            aria-hidden="true"
          />
          {it.label}
        </li>
      ))}
    </ul>
  )
}
