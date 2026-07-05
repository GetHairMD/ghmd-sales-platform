import Card from '@/components/ui/Card'
import { LAUNCH_PHASES, SUPPORT_TEAM } from './constants'

/**
 * Section 15 — light. Onboarding & Launch: 4 phases + named support team
 * (spec §6.15). Static template content.
 */
export default function OnboardingLaunch() {
  return (
    <section id="onboarding-launch" className="bg-bg px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-3xl font-bold text-text sm:text-4xl">Onboarding &amp; launch</h2>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {LAUNCH_PHASES.map((p) => (
            <Card key={p.phase} padding="lg">
              <div className="font-heading text-3xl font-bold text-accent">{p.phase}</div>
              <div className="mt-2 font-heading text-base font-bold text-text">{p.title}</div>
              <p className="mt-1 font-serif text-sm text-text-muted">{p.body}</p>
            </Card>
          ))}
        </div>

        <div className="mt-10">
          <div className="font-heading text-xs uppercase tracking-caps text-text-muted">
            Your support team
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {SUPPORT_TEAM.map((m, i) => (
              <Card key={i} padding="md">
                <div className="font-heading text-base font-bold text-text">{m.name}</div>
                <div className="font-heading text-xs uppercase tracking-caps text-primary">{m.role}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
