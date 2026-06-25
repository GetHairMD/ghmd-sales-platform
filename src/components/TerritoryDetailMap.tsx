'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

interface Props {
  lat: number
  lng: number
  territoryName: string
}

// Open Item #10: Token is URL-restricted to ghmdsalesplatform.netlify.app.
// If you hit a 401 on localhost, add http://localhost:3000 to the token's
// allowed URLs in mapbox.com/account/access-tokens, then remove before deploying.
// Do NOT workaround by removing token restriction.

export default function TerritoryDetailMap({ lat, lng, territoryName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [show30, setShow30] = useState(true)
  const [show45, setShow45] = useState(true)
  const [isochroneError, setIsochroneError] = useState<string | null>(null)
  const [isochroneLoaded, setIsochroneLoaded] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) {
      console.warn('NEXT_PUBLIC_MAPBOX_TOKEN not set — map will not render')
      return
    }
    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [lng, lat],
      zoom: 10,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    // Drop a marker at territory center
    new mapboxgl.Marker({ color: '#4681A3' })
      .setLngLat([lng, lat])
      .setPopup(new mapboxgl.Popup().setText(territoryName))
      .addTo(map)

    map.on('load', async () => {
      // Fetch isochrone polygons from Mapbox API
      const isoUrl =
        `https://api.mapbox.com/isochrone/v1/mapbox/driving/${lng},${lat}` +
        `?contours_minutes=30,45&polygons=true&access_token=${token}`

      try {
        const res = await fetch(isoUrl)
        if (!res.ok) {
          // Open Item #10: 401 likely means token URL restriction blocks localhost
          const msg = res.status === 401
            ? 'Mapbox token 401 — add localhost to token URL allowlist in mapbox.com (Open Item #10)'
            : `Isochrone API error: ${res.status}`
          console.error(msg)
          setIsochroneError(msg)
          return
        }

        const geojson: GeoJSON.FeatureCollection = await res.json()
        if (!geojson?.features?.length) return

        // Sort features so 45-min renders first (underneath 30-min)
        const sorted = [...geojson.features].sort((a, b) => {
          const aMin = (a.properties?.contour as number) ?? 0
          const bMin = (b.properties?.contour as number) ?? 0
          return bMin - aMin // 45 first
        })

        map.addSource('isochrone', { type: 'geojson', data: { type: 'FeatureCollection', features: sorted } })

        // 45-min outer ring: MIST fill with OCEAN border
        map.addLayer({
          id: 'isochrone-45-fill',
          type: 'fill',
          source: 'isochrone',
          filter: ['==', ['get', 'contour'], 45],
          paint: { 'fill-color': '#F2F2F2', 'fill-opacity': 0.5 },
        })
        map.addLayer({
          id: 'isochrone-45-border',
          type: 'line',
          source: 'isochrone',
          filter: ['==', ['get', 'contour'], 45],
          paint: { 'line-color': '#4681A3', 'line-width': 1.5 },
        })

        // 30-min primary: OCEAN fill
        map.addLayer({
          id: 'isochrone-30-fill',
          type: 'fill',
          source: 'isochrone',
          filter: ['==', ['get', 'contour'], 30],
          paint: { 'fill-color': '#4681A3', 'fill-opacity': 0.25 },
        })
        map.addLayer({
          id: 'isochrone-30-border',
          type: 'line',
          source: 'isochrone',
          filter: ['==', ['get', 'contour'], 30],
          paint: { 'line-color': '#4681A3', 'line-width': 2 },
        })

        setIsochroneLoaded(true)
      } catch (err) {
        console.error('Isochrone fetch failed:', err)
        setIsochroneError('Failed to load drive-time overlays')
      }
    })

    return () => map.remove()
  }, [lat, lng, territoryName])

  // Toggle layer visibility when checkboxes change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !isochroneLoaded) return
    const vis30 = show30 ? 'visible' : 'none'
    const vis45 = show45 ? 'visible' : 'none'
    ;['isochrone-30-fill', 'isochrone-30-border'].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis30)
    })
    ;['isochrone-45-fill', 'isochrone-45-border'].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis45)
    })
  }, [show30, show45, isochroneLoaded])

  return (
    <div>
      {/* Drive-time toggle controls */}
      <div className="flex gap-4 mb-3 text-sm">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span
            className="inline-block w-4 h-4 rounded-sm border-2"
            style={{ backgroundColor: show30 ? '#4681A3' : 'transparent', borderColor: '#4681A3' }}
          />
          <input
            type="checkbox"
            className="sr-only"
            checked={show30}
            onChange={e => setShow30(e.target.checked)}
          />
          <span className="text-gray-700">30-min primary zone</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span
            className="inline-block w-4 h-4 rounded-sm border-2"
            style={{ backgroundColor: show45 ? '#F2F2F2' : 'transparent', borderColor: '#4681A3' }}
          />
          <input
            type="checkbox"
            className="sr-only"
            checked={show45}
            onChange={e => setShow45(e.target.checked)}
          />
          <span className="text-gray-700">45-min outer ring</span>
        </label>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: '500px' }} className="rounded-lg overflow-hidden border shadow-sm" />

      {isochroneError && (
        <p className="text-xs text-amber-600 mt-2">{isochroneError}</p>
      )}
    </div>
  )
}
