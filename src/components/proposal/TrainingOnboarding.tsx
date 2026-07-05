import Card from '@/components/ui/Card'
import { WHAT_THIS_REQUIRES } from './constants'

/**
 * Section 11 — light. Training & Onboarding: testimonials (content-pending) +
 * "What this actually requires of you" (3 cards) per spec §6.11. Static.
 */
export default function TrainingOnboarding() {
  return (
    <section id="training-onboarding" className="bg-bg px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-3xl font-bold text-text sm:text-4xl">Training &amp; onboarding</h2>
        <p className="mt-3 max-w-2xl font-serif text-lg text-text-muted">
          What this actually requires of you.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {WHAT_THIS_REQUIRES.map((c) => (
            <Card key={c.title} padding="lg">
              <h3 className="font-heading text-sm uppercase tracking-caps text-primary">{c.title}</h3>
              <p className="mt-3 font-serif text-base text-text-muted">{c.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
