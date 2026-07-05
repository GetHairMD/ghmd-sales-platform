import { ALIGNMENT_BULLETS } from './constants'

/** Small Sunlights (accent) check mark. */
function Check() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="mt-1 h-5 w-5 shrink-0 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Section 7 — dark Practice Alignment (spec §6.7). Interior-photo panel + 4 fit
 * bullets with Sunlights checks. Per spec §5 the bullets are variable per
 * prospect; the data model + generator wiring is Session D, so these render from
 * a content-pending template default (spec §10). No viability semantics.
 */
export default function PracticeAlignment() {
  return (
    <section id="practice-alignment" className="bg-black px-6 py-16 text-text-inverse sm:py-24">
      <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2">
        {/* Interior photo placeholder (content-pending) */}
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl border border-text-inverse/15 text-sm text-text-inverse/40">
          Practice photo
        </div>

        <div>
          <h2 className="font-heading text-3xl font-bold sm:text-4xl">Why this fits your practice</h2>
          <ul className="mt-8 space-y-6">
            {ALIGNMENT_BULLETS.map((b, i) => (
              <li key={i} className="flex gap-3">
                <Check />
                <div>
                  <div className="font-heading text-base font-bold text-text-inverse">{b.title}</div>
                  <p className="mt-1 font-serif text-sm text-text-inverse/70">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
