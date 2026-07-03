import { notFound } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { geoToFips, fetchB19001ForCounty, computeAddressableDetail } from '@/lib/census'
import { CENSUS_CACHE_TTL_DAYS, CENSUS_ACS5_VINTAGE } from '../../../../lib/addressable-market-constants'
import ScenarioCards from '@/components/ScenarioCards'
import ViabilityBadge from '@/components/ViabilityBadge'
import { penetrationScenarios } from '@/lib/territory-sizing'

const TerritoryDetailMap = dynamic(() => import('@/components/TerritoryDetailMap'), { ssr: false })

interface PageProps {
  params: { id: string }
}

export default async function TerritoryDetailPage({ params }: PageProps) {
  const supabase = createClient()

  const { data: territory, error } = await supabase
    .from('territories')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !territory) return notFound()

  // Determine if census cache is stale
  const cacheExpiresAt = territory.census_fetched_at
    ? new Date(territory.census_fetched_at).getTime() + CENSUS_CACHE_TTL_DAYS * 86_400_000
    : 0
  const cacheStale = Date.now() > cacheExpiresAt

  let censusError: string | null = null
  let currentAddressable = territory.addressable_patients_primary as number | null

  if (cacheStale && territory.center_lat && territory.center_lng) {
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

  const statusColors: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    reserved: 'bg-yellow-100 text-yellow-700',
    sold: 'bg-red-100 text-red-700',
  }
  const statusLabel = territory.status ?? 'available'

  return (
    <main className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <a href="/territories" className="text-sm text-[#4681A3] hover:underline mb-2 inline-block">
            ← All Territories
          </a>
          <h1 className="text-2xl font-bold text-gray-900">{territory.name}</h1>
        </div>
        <span className={`text-sm px-3 py-1 rounded-full font-medium capitalize ${statusColors[statusLabel] ?? 'bg-gray-100 text-gray-700'}`}>
          {statusLabel}
        </span>
      </div>

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
