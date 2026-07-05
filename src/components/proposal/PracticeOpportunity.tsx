'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Card from '@/components/ui/Card'
import { cn } from '@/design/cn'
import { trackProposalEvent } from '@/components/proposal/analytics'
import type {
  PenetrationScenarioView,
  ProposalRecord,
} from '@/lib/proposal/types'

interface PracticeOpportunityProps {
  slug: string
  proposal: ProposalRecord
  penetration: PenetrationScenarioView[]
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** Package-mix presets — cosmetic multipliers applied client-side to the stored
 *  scenario outputs. NOT formula constants: they scale a finished dollar figure. */
const PACKAGE_MIX = {
  Standard: 1.0,
  Mixed: 1.15,
  Premium: 1.35,
} as const
type PackageMix = keyof typeof PACKAGE_MIX

function num(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** A labelled dollar figure in the sample well or results card. */
function Figure({
  label,
  amount,
  inverse = false,
}: {
  label: string
  amount: number | null
  inverse?: boolean
}) {
  return (
    <div>
      <div
        className={cn(
          'font-heading text-xs uppercase tracking-caps',
          inverse ? 'text-text-inverse/60' : 'text-text-muted',
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'mt-1 font-heading text-2xl font-bold',
          inverse ? 'text-text-inverse' : 'text-text',
        )}
      >
        {amount == null ? '—' : usd.format(amount)}
      </div>
    </div>
  )
}

/**
 * Section 3 — light. A read-only sample scenario well plus an interactive ROI
 * calculator. The calculator SCALES the server-computed scenario outputs
 * client-side (pure arithmetic) — no sizing logic or formula constants ever
 * enter this client bundle. Analytics on input is debounced.
 */
export default function PracticeOpportunity({
  slug,
  proposal,
  penetration,
}: PracticeOpportunityProps) {
  const inputs = proposal.scenario_inputs
  const outputs = proposal.scenario_outputs

  const baseCount = num(inputs?.patient_base, 0)

  // Interactive controls
  const [patientBase, setPatientBase] = useState<number>(baseCount)
  const [packageMix, setPackageMix] = useState<PackageMix>('Standard')
  const [specialty, setSpecialty] = useState<string>(proposal.specialty?.trim() || 'General')

  // Debounced analytics — fire 600ms after the last interaction.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      trackProposalEvent(slug, 'calculator_interaction', { patientBase, packageMix })
    }, 600)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [slug, patientBase, packageMix])

  // Scale factor: base ratio × package multiplier. Guard against a zero/absent base.
  const factor = useMemo(() => {
    const ratio = baseCount > 0 ? patientBase / baseCount : 1
    return ratio * PACKAGE_MIX[packageMix]
  }, [patientBase, baseCount, packageMix])

  const scaled = outputs
    ? {
        conservative: num(outputs.conservative) * factor,
        moderate: num(outputs.moderate) * factor,
        growth: num(outputs.growth) * factor,
      }
    : null

  const breakEven = outputs?.break_even_months

  return (
    <section id="practice-opportunity" className="bg-bg-subtle px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-3xl font-bold text-text sm:text-4xl">
          Your practice opportunity
        </h2>
        <p className="mt-3 max-w-2xl font-serif text-lg text-text-muted">
          A sample projection for a practice of this profile — then model your own.
        </p>

        {/* Sample scenario well */}
        <Card padding="lg" className="mt-8">
          <h3 className="font-heading text-sm uppercase tracking-caps text-text-muted">
            Sample scenario
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-3">
            <div>
              <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
                Patient base
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-text">
                {inputs ? num(inputs.patient_base).toLocaleString() : '—'}
              </div>
            </div>
            <div>
              <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
                Candidate share
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-text">
                {inputs ? `${num(inputs.candidate_pct)}%` : '—'}
              </div>
            </div>
            <div>
              <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
                Conversion pace
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-text">
                {inputs ? num(inputs.conversion_pace).toLocaleString() : '—'}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-6 border-t border-mist pt-6 sm:grid-cols-4">
            <Figure label="Conservative" amount={outputs ? num(outputs.conservative) : null} />
            <Figure label="Moderate" amount={outputs ? num(outputs.moderate) : null} />
            <Figure label="Growth" amount={outputs ? num(outputs.growth) : null} />
            <div>
              <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
                Break-even
              </div>
              <div className="mt-1 font-heading text-2xl font-bold text-text">
                {breakEven == null ? '—' : `${num(breakEven)} months`}
              </div>
            </div>
          </div>
        </Card>

        {/* Interactive ROI calculator */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card padding="lg">
            <h3 className="font-heading text-sm uppercase tracking-caps text-text-muted">
              Model your own
            </h3>
            <div className="mt-6 space-y-5">
              <label className="block">
                <span className="font-heading text-xs uppercase tracking-caps text-text-muted">
                  Patient base
                </span>
                <input
                  type="number"
                  min={0}
                  value={patientBase}
                  onChange={(e) => setPatientBase(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-2 w-full rounded-md border border-mist bg-bg px-3 py-2 font-body text-text focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>

              <label className="block">
                <span className="font-heading text-xs uppercase tracking-caps text-text-muted">
                  Package mix
                </span>
                <select
                  value={packageMix}
                  onChange={(e) => setPackageMix(e.target.value as PackageMix)}
                  className="mt-2 w-full rounded-md border border-mist bg-bg px-3 py-2 font-body text-text focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="Standard">Standard</option>
                  <option value="Mixed">Mixed</option>
                  <option value="Premium">Premium</option>
                </select>
              </label>

              <label className="block">
                <span className="font-heading text-xs uppercase tracking-caps text-text-muted">
                  Specialty
                </span>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="mt-2 w-full rounded-md border border-mist bg-bg px-3 py-2 font-body text-text focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {[specialty, 'General', 'Dermatology', 'Plastic Surgery']
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </Card>

          {/* Dark results card */}
          <Card padding="lg" className="border-black bg-black text-text-inverse">
            <h3 className="font-heading text-sm uppercase tracking-caps text-text-inverse/60">
              Projected revenue
            </h3>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <Figure label="Conservative" amount={scaled?.conservative ?? null} inverse />
              <Figure label="Moderate" amount={scaled?.moderate ?? null} inverse />
              <Figure label="Growth" amount={scaled?.growth ?? null} inverse />
            </div>
            <p className="mt-6 border-t border-text-inverse/15 pt-4 font-serif text-sm text-text-inverse/70">
              Illustrative projection scaled from the sample scenario above.
            </p>
          </Card>
        </div>

        {/* Penetration strip (presentational; omitted when empty) */}
        {penetration.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {penetration.map((p) => (
              <Card key={p.label} padding="md">
                <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
                  {p.label}
                </div>
                <div className="mt-1 font-heading text-2xl font-bold text-text">
                  {p.customers.toLocaleString()}
                </div>
                <div className="mt-1 text-sm text-text-muted">
                  projected customers · {Math.round(p.rate * 100)}%
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
