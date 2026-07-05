import Card from '@/components/ui/Card'
import { ADVISORY_BOARD } from './constants'

/**
 * Section 16 — light. Clinical Advisory Board static grid (spec §6.16).
 * Content-pending placeholders.
 */
export default function AdvisoryBoard() {
  return (
    <section id="advisory-board" className="bg-bg px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-3xl font-bold text-text sm:text-4xl">Clinical advisory board</h2>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {ADVISORY_BOARD.map((a, i) => (
            <Card key={i} padding="lg" className="text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-mist" aria-hidden="true" />
              <div className="mt-3 font-heading text-base font-bold text-text">{a.name}</div>
              <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
                {a.credential}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
