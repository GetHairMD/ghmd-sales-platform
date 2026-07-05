import Card from '@/components/ui/Card'
import type { ProposalRecord } from '@/lib/proposal/types'
import { INVESTMENT_INCLUDED, formatTerritoryPrice } from './constants'

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function Figure({ label, amount, inverse = false }: { label: string; amount: number | null; inverse?: boolean }) {
  return (
    <div>
      <div
        className={
          'font-heading text-xs uppercase tracking-caps ' +
          (inverse ? 'text-text-inverse/60' : 'text-text-muted')
        }
      >
        {label}
      </div>
      <div
        className={'mt-1 font-heading text-2xl font-bold ' + (inverse ? 'text-text-inverse' : 'text-text')}
      >
        {amount == null ? '—' : usd.format(amount)}
      </div>
    </div>
  )
}

/**
 * Section 14 — light Investment (spec §6.14). $179K price block (Key Reference
 * Value), an ROI snapshot that renders the STORED scenario_outputs, the
 * included-items grid, and the black "territory is an asset" card.
 *
 * ⚠ Legal (spec §10; decisions #71/#76): scenario_outputs are ILLUSTRATIVE only —
 * no formula-v2 revenue producer exists. This section renders whatever is stored
 * with the existing illustrative framing and adds NO new revenue figures and NO
 * precision the data doesn't have.
 */
export default function Investment({ proposal }: { proposal: ProposalRecord }) {
  const o = proposal.scenario_outputs
  const breakEven = o?.break_even_months

  return (
    <section id="investment" className="bg-bg px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-3xl font-bold text-text sm:text-4xl">Investment</h2>

        {/* Price block */}
        <Card padding="lg" className="mt-8">
          <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
            Standard territory price
          </div>
          <div className="mt-1 font-heading text-5xl font-bold text-text">{formatTerritoryPrice()}</div>
        </Card>

        {/* ROI snapshot — stored illustrative scenario outputs */}
        <Card padding="lg" className="mt-6">
          <h3 className="font-heading text-sm uppercase tracking-caps text-text-muted">
            Illustrative ROI snapshot
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Figure label="Conservative" amount={o ? num(o.conservative) : null} />
            <Figure label="Moderate" amount={o ? num(o.moderate) : null} />
            <Figure label="Growth" amount={o ? num(o.growth) : null} />
            <div>
              <div className="font-heading text-xs uppercase tracking-caps text-text-muted">Break-even</div>
              <div className="mt-1 font-heading text-2xl font-bold text-text">
                {breakEven == null ? '—' : `${num(breakEven)} months`}
              </div>
            </div>
          </div>
          <p className="mt-4 border-t border-mist pt-4 font-serif text-sm text-text-muted">
            Illustrative projection only — not a forecast or guarantee of results.
          </p>
        </Card>

        {/* Included-items grid */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INVESTMENT_INCLUDED.map((item) => (
            <Card key={item} padding="md">
              <span className="font-body text-sm text-text">{item}</span>
            </Card>
          ))}
        </div>

        {/* Black "territory is an asset" card — qualitative, no earnings figures. */}
        <Card padding="lg" className="mt-6 border-black bg-black text-text-inverse">
          <h3 className="font-heading text-lg font-bold text-text-inverse">
            Your territory is an asset
          </h3>
          <p className="mt-2 font-serif text-base text-text-inverse/80">
            An exclusive, protected market you own and grow.
          </p>
        </Card>
      </div>
    </section>
  )
}
