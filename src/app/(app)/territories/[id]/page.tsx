import { notFound } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { geoToFips, fetchB19001ForCounty, computeAddressableDetail } from '@/lib/census'
import { CENSUS_CACHE_TTL_DAYS, CENSUS_ACS5_VINTAGE } from '../../../../../lib/addressable-market-constants'
import ScenarioCards from '@/components/ScenarioCards'
import ViabilityBadge from '@/components/ViabilityBadge'
import AddressableVsFloor from '@/components/territory/AddressableVsFloor'
import PendingReviewNotice from '@/components/territory/PendingReviewNotice'
import { penetrationScenarios } from '@/lib/territory-sizing'
import { getViewerDesignation } from '@/lib/auth/internal-role'
import {
  resolveTerritoryDisplayKind,
  addressableFloorStatus,
  shouldRefreshV2Census,
} from '@/lib/territories/v3-display'
import type { InitialSizingJob } from '@/components/territory/V3SizingPanel'

const TerritoryDetailMap = dynamic(() => import('@/components/TerritoryDetailMap'), { ssr: false })
// Client + mapbox-gl → never SSR.
const TerritoryBoundaryMap = dynamic(() => import('@/components/territory/TerritoryBoundaryMap'), { ssr: false })
const V3SizingPanel = dynamic(() => import('@/components/territory/V3SizingPanel'), { ssr: false })

interface PageProps {
  params: { id: string }
}

const statusColors: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  reserved: 'bg-yellow-100 text-yellow-700',
  sold: 'bg-red-100 text-red-700',
}

function TerritoryHeader({ name, status }: { name: string; status: string }) {
  return (
    <div className="flex justify-between items-start mb-6">
      <div>
        <a href="/territories" className="text-sm text-[#4681A3] hover:underline mb-2 inline-block">
          ← All Territories
        </a>
        <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
      </div>
      <span className={`text-sm px-3 py-1 rounded-full font-medium capitalize ${statusColors[status] ?? 'bg-gray-100 text-gray-700'}`}>
        {status}
      </span>
    </div>
  )
}

export default async function TerritoryDetailPage({ params }: PageProps) {
  const supabase = createClient()

  const { data: territory, error } = await supabase
    .from('territories')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !territory) return notFound()

  const designation = await getViewerDesignation()
  const isExec = designation === 'executive'
  const statusLabel = territory.status ?? 'available'
  const center =
    territory.center_lat != null && territory.center_lng != null
      ? { lat: Number(territory.center_lat), lng: Number(territory.center_lng) }
      : null

  const displayKind = resolveTerritoryDisplayKind({
    formula_version: territory.formula_version,
    boundary_geojson: territory.boundary_geojson,
    addressable_patients_primary: territory.addressable_patients_primary,
  })

  // Latest sizing job for this territory drives the executive panel (resume / preview after a
  // reload). Jobs table is service-role-only; only fetched for executives.
  let initialJob: InitialSizingJob | null = null
  if (isExec) {
    const { data: job } = await createServiceClient()
      .from('territory_sizing_jobs')
      .select('id, status, result, error')
      .eq('input_territory_id', territory.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (job) {
      initialJob = { jobId: job.id, status: job.status, result: job.result, error: job.error }
    }
  }

  // ── PENDING: no displayable number and no approved boundary ───────────────────────────────
  if (displayKind === 'PENDING_REVIEW') {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <TerritoryHeader name={territory.name} status={statusLabel} />
        {isExec ? (
          <V3SizingPanel
            territoryId={territory.id}
            territoryStatus={statusLabel}
            mode="size"
            center={center}
            initialJob={initialJob}
          />
        ) : (
          <PendingReviewNotice />
        )}
      </main>
    )
  }

  // ── APPROVED v3: single-ring boundary + addressable-vs-floor headline, NO minutes ─────────
  if (displayKind === 'APPROVED_V3') {
    const v3Addressable =
      (territory.boundary_source as { addressable?: number } | null)?.addressable ??
      territory.addressable_patients_primary ??
      0
    const sizing = penetrationScenarios(addressableFloorStatus(v3Addressable).addressable)
    const boundaryFeature = territory.boundary_geojson as GeoJSON.Feature

    return (
      <main className="p-6 max-w-5xl mx-auto">
        <TerritoryHeader name={territory.name} status={statusLabel} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <AddressableVsFloor addressable={v3Addressable} />
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <p className="text-gray-500 text-sm uppercase tracking-wide mb-1">Territory Price</p>
            <p className="text-2xl font-bold text-gray-900">$179,000</p>
            <p className="text-gray-500 text-sm mt-1">Standard Phase 1 pricing</p>
          </div>
        </div>

        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Projected Demand</h2>
            <ViabilityBadge sizing={sizing} />
          </div>
          <ScenarioCards sizing={sizing} internal />
        </section>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Territory Boundary</h2>
          <TerritoryBoundaryMap feature={boundaryFeature} center={center} />
        </div>

        {isExec && (
          <div className="mb-6">
            <V3SizingPanel
              territoryId={territory.id}
              territoryStatus={statusLabel}
              mode="resize"
              center={center}
              initialJob={initialJob}
            />
          </div>
        )}

        {territory.notes && (
          <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-700 mb-1">Notes</p>
            <p className="text-sm text-gray-600">{territory.notes}</p>
          </div>
        )}
      </main>
    )
  }

  // ── V2_LEGACY: existing ZCTA/county display — UNCHANGED (AC7). Executives additionally get
  //    an additive "Size with v3" panel; reps see exactly what they see today. ───────────────

  let censusError: string | null = null
  let currentAddressable = territory.addressable_patients_primary as number | null

  // qa_locked anchors are protected reference fixtures — NEVER recompute/overwrite them from a
  // render side-effect (2026-07-10 Nashville incident: a stale-cache render clobbered the locked
  // 4,127 figure with a whole-county recompute). shouldRefreshV2Census folds the qa_locked guard
  // in with the cache-TTL freshness + center-coords checks that gated this block before.
  if (shouldRefreshV2Census(territory)) {
    const censusApiKey = process.env.CENSUS_API_KEY
    if (!censusApiKey) {
      console.error('[census] CENSUS_API_KEY not set — skipping refresh')
      censusError = 'Census API key not configured'
    } else {
      try {
        const { stateFips, countyFips } = await geoToFips(
          Number(territory.center_lat),
          Number(territory.center_lng),
        )
        const acsVars = await fetchB19001ForCounty(stateFips, countyFips, censusApiKey)
        // v2 corrected formula: addressable households = households × income × credit (no prevalence)
        const detail = computeAddressableDetail(acsVars, stateFips)
        const addressableCount = Math.round(detail.addressable)

        // Persist census data using admin client (bypasses RLS for server-side write)
        const admin = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        await admin
          .from('territories')
          .update({
            census_raw_data: acsVars,
            census_fetched_at: new Date().toISOString(),
            addressable_patients_primary: addressableCount,
            formula_run_at: new Date().toISOString(),
            formula_inputs: {
              stateFips,
              countyFips,
              households: detail.households,
              income_qualified_share: detail.incomeShare,
              credit_eligible_share: detail.creditShare,
              source: `census_acs5_${CENSUS_ACS5_VINTAGE}`,
              formula: 'households × income_qualified × credit_eligible (v2, no prevalence)',
            },
          })
          .eq('id', territory.id)

        currentAddressable = addressableCount
      } catch (err) {
        console.error('[census] fetch/compute failed:', err)
        censusError = err instanceof Error ? err.message : 'Census data unavailable'
      }
    }
  }

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <TerritoryHeader name={territory.name} status={statusLabel} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Addressable Market Card */}
        <div className="bg-[#4681A3] text-white rounded-xl p-5">
          <p className="text-white/70 text-sm uppercase tracking-wide mb-1">Addressable Market</p>
          {currentAddressable != null ? (
            <>
              <p className="text-4xl font-bold">{currentAddressable.toLocaleString()}</p>
              <p className="text-white/70 text-sm mt-1">30-min primary zone</p>
            </>
          ) : (
            <p className="text-2xl font-semibold opacity-60">Pending</p>
          )}
        </div>

        {/* Drive-Time Card */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <p className="text-gray-500 text-sm uppercase tracking-wide mb-1">Drive-Time Zones</p>
          <p className="text-2xl font-bold text-gray-900">
            {territory.drive_time_minutes ?? 30}-min primary
          </p>
          <p className="text-gray-500 text-sm mt-1">
            {territory.outer_ring_minutes ?? 45}-min outer ring
          </p>
        </div>

        {/* Territory Price Card */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <p className="text-gray-500 text-sm uppercase tracking-wide mb-1">Territory Price</p>
          <p className="text-2xl font-bold text-gray-900">$179,000</p>
          <p className="text-gray-500 text-sm mt-1">Standard Phase 1 pricing</p>
        </div>
      </div>

      {/* Projected Demand — scenarios + explicit viability (internal shows red/yellow/green) */}
      {currentAddressable != null && (() => {
        const sizing = penetrationScenarios(currentAddressable)
        return (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Projected Demand</h2>
              <ViabilityBadge sizing={sizing} />
            </div>
            <ScenarioCards sizing={sizing} internal />
          </section>
        )
      })()}

      {censusError && (
        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          Census data unavailable: {censusError}. Addressable market figure may be stale.
        </div>
      )}

      {/* Map with isochrone overlays */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Drive-Time Map</h2>
        <TerritoryDetailMap
          lat={Number(territory.center_lat)}
          lng={Number(territory.center_lng)}
          territoryName={territory.name}
        />
      </div>

      {/* Executive-only v3 sizing entry — additive; the v2 display above is unchanged. */}
      {isExec && (
        <div className="mb-6">
          <V3SizingPanel
            territoryId={territory.id}
            territoryStatus={statusLabel}
            mode="size"
            center={center}
            initialJob={initialJob}
          />
        </div>
      )}

      {/* Census data source note */}
      {territory.census_fetched_at && (
        <p className="text-xs text-gray-400 mt-2">
          Addressable market calculated from Census ACS 5-Year data.
          Last refreshed: {new Date(territory.census_fetched_at).toLocaleDateString()}.
          {' '}Data refreshes automatically after {CENSUS_CACHE_TTL_DAYS} days.
        </p>
      )}

      {/* Notes */}
      {territory.notes && (
        <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-700 mb-1">Notes</p>
          <p className="text-sm text-gray-600">{territory.notes}</p>
        </div>
      )}
    </main>
  )
}
