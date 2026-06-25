'use client'
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

export default function MapClient() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    // Token is restricted to ghmdsalesplatform.netlify.app — map will 401 on localhost.
    // To test locally: add http://localhost:3000 to the token's allowed URLs in
    // mapbox.com/account/access-tokens, then remove before deploying.
    if (!token) {
      console.warn('NEXT_PUBLIC_MAPBOX_TOKEN not set — map will not render')
      return
    }
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-98.5, 39.5],
      zoom: 4,
    })
    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    return () => map.remove()
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '560px' }} />
}
