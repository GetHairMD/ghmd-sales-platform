import Card from '@/components/ui/Card'
import type { ProposalRecord } from '@/lib/proposal/types'
import TerritoryMap from './TerritoryMap'
import DemandTable from './DemandTable'

interface TerritoryAnalysisProps {
  proposal: ProposalRecord
}

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** A neutral, brand-styled stat card. Uniform brand styling only. */
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card padding="lg">
      <div className="font-heading text-xs uppercase tracking-caps text-text-muted">{label}</div>
      <div className="mt-2 font-heading text-3xl font-bold text-text">{value}</div>
      {sub && <div className="mt-1 text-sm text-text-muted">{sub}</div>}
    </Card>
  )
}

/**
 * Section 4 — light. Territory analysis: prospect/practice context, three neutral
 * stat cards (addressable market, year-1 new patients, exclusivity), the branded
 * territory map, and the ACS age × sex demographic table.
 *
 * Decision #68: the demographic table is analytically separate from the
 * addressable-market figures and is presented as plain population context.
 */
export default function TerritoryAnalysis({ proposal }: TerritoryAnalysisProps) {
  const addressable =
    proposal.addressable_market_total != null
      ? int.format(proposal.addressable_market_total)
      : '—'

  const low = proposal.new_patients_range_low
  const high = proposal.new_patients_range_high
  const newPatients =
    low != null && high != null
      ? `${int.format(low)}–${int.format(high)}`
      : low != null
        ? int.format(low)
        : high != null
          ? int.format(high)
          : '—'

  return (
    <section id="territory-analysis" className="bg-bg px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-3xl font-bold text-text sm:text-4xl">
          Territory Analysis
        </h2>

        {/* Prospect / practice context */}
        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center">
          {proposal.prospect_photo_url && (
            <img
              src={proposal.prospect_photo_url}
              alt={proposal.prospect_name_full ?? 'Prospect'}
              className="h-24 w-24 rounded-full object-cover"
            />
          )}
          <Card padding="lg" className="flex-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
                  Practice
                </div>
                <div className="mt-1 font-serif text-base text-text">
                  {proposal.practice_name?.trim() || '—'}
                </div>
              </div>
              <div>
                <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
                  Specialty
                </div>
                <div className="mt-1 font-serif text-base text-text">
                  {proposal.specialty?.trim() || '—'}
                </div>
              </div>
              <div>
                <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
                  Territory
                </div>
                <div className="mt-1 font-serif text-base text-text">
                  {proposal.territory_name?.trim() || '—'}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Neutral stat cards */}
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <StatCard label="Addressable market" value={addressable} />
          <StatCard label="New patients (year 1)" value={newPatients} />
          <StatCard label="Exclusivity" value="1 territory" sub="Exclusive" />
        </div>

        {/* Branded territory map */}
        <div className="mt-8">
          <TerritoryMap
            lat={proposal.territory_pin_lat}
            lng={proposal.territory_pin_lng}
            territoryName={proposal.territory_name}
            polygon={proposal.territory_polygon}
          />
        </div>

        {/* ACS demographic composition */}
        {proposal.demand_matrix && (
          <div className="mt-8">
            <DemandTable
              matrix={proposal.demand_matrix}
              malePct={proposal.addressable_market_male_pct}
              femalePct={proposal.addressable_market_female_pct}
            />
          </div>
        )}
      </div>
    </section>
  )
}
