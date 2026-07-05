import Card from '@/components/ui/Card'
import { GEMS_TILES, PLATFORM_PILLARS } from './constants'

/**
 * Section 8 — light. The Platform: three capability pillars (Clinical / Business
 * / Support) + G.E.M.S. tiles (spec §6.8). Static template content.
 */
export default function PlatformSection() {
  return (
    <section id="platform" className="bg-bg px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-3xl font-bold text-text sm:text-4xl">The platform</h2>
        <p className="mt-3 max-w-2xl font-serif text-lg text-text-muted">
          Everything the network brings to your practice.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PLATFORM_PILLARS.map((p) => (
            <Card key={p.title} padding="lg">
              <h3 className="font-heading text-sm uppercase tracking-caps text-primary">{p.title}</h3>
              <p className="mt-3 font-serif text-base text-text-muted">{p.body}</p>
            </Card>
          ))}
        </div>

        <div className="mt-10">
          <div className="font-heading text-xs uppercase tracking-caps text-text-muted">G.E.M.S.</div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {GEMS_TILES.map((t, i) => (
              <Card key={i} padding="md" className="text-center">
                <div className="font-heading text-3xl font-bold text-accent">{t.letter}</div>
                <div className="mt-1 text-xs uppercase tracking-caps text-text-muted">{t.caption}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
