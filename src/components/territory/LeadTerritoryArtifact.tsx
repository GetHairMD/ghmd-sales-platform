'use client'

import dynamic from 'next/dynamic'
import AddressableVsFloor from './AddressableVsFloor'

// mapbox-gl touches window at import time → load client-only.
const TerritoryBoundaryMap = dynamic(() => import('./TerritoryBoundaryMap'), { ssr: false })

/**
 * Read-only "Territory" artifact on a prospect's Lead profile (brief §D). Rendered ONLY when
 * the linked territory has an approved v3 boundary. No sizing, no approve, no re-open controls
 * regardless of viewer role — this is a static mirror of the approved result. Addressable
 * headline + boundary map; never any drive-time minutes (AC2).
 */
export default function LeadTerritoryArtifact({
  name,
  addressable,
  boundaryFeature,
  center,
}: {
  name: string
  addressable: number
  boundaryFeature: GeoJSON.Feature
  center?: { lat: number; lng: number } | null
}) {
  return (
    <div className="space-y-3 rounded-lg border border-mist bg-bg p-4">
      <div>
        <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Territory</p>
        <p className="mt-0.5 text-sm font-semibold text-text">{name}</p>
      </div>
      <AddressableVsFloor addressable={addressable} />
      <TerritoryBoundaryMap feature={boundaryFeature} center={center ?? null} height={200} />
    </div>
  )
}
