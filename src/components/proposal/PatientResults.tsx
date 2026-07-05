import { PATIENT_RESULTS_NOTE } from './constants'

/**
 * Section 12 — Ocean. Patient Results (spec §6.12). CLAIMS-GATED (spec §10 ⚠):
 * this is a static shell only — NO efficacy percentages, NO before/after claims,
 * NO outcome numbers until CLAIMS_MATRIX-cleared assets exist. Placeholders for
 * the stats / before-after / video slots carry no claims.
 */
export default function PatientResults() {
  return (
    <section id="patient-results" className="bg-ocean px-6 py-16 text-text-inverse sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-3xl font-bold sm:text-4xl">Patient results</h2>
        <p className="mt-3 max-w-2xl font-serif text-lg text-text-inverse/80">
          {PATIENT_RESULTS_NOTE}
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Before/after placeholder */}
          <div className="flex min-h-[14rem] items-center justify-center rounded-xl border border-text-inverse/20 text-sm text-text-inverse/50">
            Before &amp; after — pending approval
          </div>
          {/* Video placeholder */}
          <div className="flex min-h-[14rem] items-center justify-center rounded-xl border border-text-inverse/20 text-sm text-text-inverse/50">
            Video — pending approval
          </div>
        </div>
      </div>
    </section>
  )
}
