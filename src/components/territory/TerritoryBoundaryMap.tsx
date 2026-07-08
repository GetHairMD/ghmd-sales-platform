'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

/**
 * Single drive-time boundary render for v3 territories (brief §B/§C/§D). Draws ONE polygon
 * from the saved/preview boundary GeoJSON feature — the two-ring 30/45 display is retired for
 * v3 (AC7 scopes retirement to formula_version=3 only; the v2 TerritoryDetailMap is unchanged).
 *
 * Deliberately renders NO drive-time minutes anywhere (AC2). It takes the already-computed
 * boundary feature and never calls the Isochrone API itself.
 */

interface Props {
  /** GeoJSON Polygon/MultiPolygon feature (the sized boundary). */
  feature: GeoJSON.Feature
  /** Fallback center marker (practice location), optional. */
  center?: { lat: number; lng: number } | null
  height?: number
}

/** Compute [[minLng,minLat],[maxLng,maxLat]] from a polygonal feature. */
function featureBounds(feature: GeoJSON.Feature): mapboxgl.LngLatBoundsLike | null {
  const g = feature.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  for (const poly of polys as number[][][][]) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng
        if (lat < minLat) minLat = lat
        if (lng > maxLng) maxLng = lng
        if (lat > maxLat) maxLat = lat
      }
    }
  }
  if (!Number.isFinite(minLng)) return null
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ]
}

export default function TerritoryBoundaryMap({ feature, center, height = 460 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) {
      console.warn('NEXT_PUBLIC_MAPBOX_TOKEN not set — boundary map will not render')
      return
    }
    mapboxgl.accessToken = token

    const bounds = featureBounds(feature)
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: center ? [center.lng, center.lat] : [-97.7431, 30.2672],
      zoom: 9,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    if (center) {
      new mapboxgl.Marker({ color: '#4681A3' }).setLngLat([center.lng, center.lat]).addTo(map)
    }

    map.on('load', () => {
      map.addSource('boundary', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [feature] },
      })
      // OCEAN fill + border — single defensible catchment, no ring labels.
      map.addLayer({
        id: 'boundary-fill',
        type: 'fill',
        source: 'boundary',
        paint: { 'fill-color': '#4681A3', 'fill-opacity': 0.2 },
      })
      map.addLayer({
        id: 'boundary-border',
        type: 'line',
        source: 'boundary',
        paint: { 'line-color': '#4681A3', 'line-width': 2 },
      })
      if (bounds) map.fitBounds(bounds, { padding: 40, duration: 0 })
    })

    return () => map.remove()
  }, [feature, center])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height }}
      className="rounded-lg overflow-hidden border border-mist shadow-sm"
    />
  )
}
