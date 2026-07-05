'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPin } from 'lucide-react'
import { palette } from '@/design/tokens'

interface TerritoryMapProps {
  lat: number | null
  lng: number | null
  territoryName: string | null
  /** GeoJSON territory boundary, if available. Unknown shape → guarded at runtime. */
  polygon: unknown | null
}

/** Narrow runtime guard: is this value plausibly a GeoJSON Feature/Geometry? */
function isGeoJson(value: unknown): value is GeoJSON.GeoJSON {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

/**
 * Section 4 map. Renders a branded (OCEAN) pin and optional territory boundary
 * fill/line via mapbox-gl. Falls back to a dashed placeholder when the token or
 * coordinates are missing. Token-clean: no hardcoded hex, no formula constants.
 */
export default function TerritoryMap({ lat, lng, territoryName, polygon }: TerritoryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const hasCoords = typeof lat === 'number' && typeof lng === 'number'
  const canRenderMap = Boolean(token) && hasCoords

  useEffect(() => {
    if (!canRenderMap || !containerRef.current || lat == null || lng == null) return
    mapboxgl.accessToken = token as string

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [lng, lat],
      zoom: 9,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    // Branded pin (OCEAN) — never the default mapbox blue.
    const marker = new mapboxgl.Marker({ color: palette.ocean }).setLngLat([lng, lat])
    if (territoryName) {
      marker.setPopup(new mapboxgl.Popup().setText(territoryName))
    }
    marker.addTo(map)

    // Optional territory boundary overlay.
    if (isGeoJson(polygon)) {
      map.on('load', () => {
        map.addSource('territory', { type: 'geojson', data: polygon })
        map.addLayer({
          id: 'territory-fill',
          type: 'fill',
          source: 'territory',
          paint: { 'fill-color': palette.ocean, 'fill-opacity': 0.15 },
        })
        map.addLayer({
          id: 'territory-line',
          type: 'line',
          source: 'territory',
          paint: { 'line-color': palette.ocean, 'line-width': 2 },
        })
      })
    }

    return () => map.remove()
  }, [canRenderMap, token, lat, lng, territoryName, polygon])

  if (!canRenderMap) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-mist bg-bg-subtle">
        <MapPin className="h-8 w-8 text-text-muted" aria-hidden="true" />
        <p className="font-heading text-sm uppercase tracking-caps text-text-muted">
          Protected territory map
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-[420px] w-full overflow-hidden rounded-xl border border-mist shadow-sm"
    />
  )
}
