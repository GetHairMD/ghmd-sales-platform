import { COMMON_QUESTIONS } from './constants'

/**
 * Section 17 — Common Questions (spec §6.17). ALWAYS EXPANDED — the collapse/
 * expand affordance is removed entirely per spec. Static FAQ; server component
 * (no interactivity by design).
 */
export default function CommonQuestions() {
  return (
    <section id="common-questions" className="bg-bg px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-heading text-3xl font-bold text-text sm:text-4xl">Common questions</h2>

        <dl className="mt-10 space-y-8">
          {COMMON_QUESTIONS.map((item, i) => (
            <div key={i} className="border-b border-mist pb-6">
              <dt className="font-heading text-lg font-bold text-text">{item.q}</dt>
              <dd className="mt-2 font-serif text-base text-text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
