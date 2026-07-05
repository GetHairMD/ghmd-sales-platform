import { NETWORK_LOCATION_COUNT } from './constants'

/**
 * Section 13 — dark National Network (spec §6.13). Renders ONE sourced count in
 * both the headline and the body (resolving the legacy "80+" headline vs
 * "65+ active" body inconsistency — one number, one source). The number comes
 * from NETWORK_LOCATION_COUNT; while it is null (pending Trace's figure + source)
 * the section renders number-free copy — no figure is invented. The map is a
 * branded-marker placeholder (no default blue marker).
 */
export default function NationalNetwork() {
  const count = NETWORK_LOCATION_COUNT
  const headline = count != null ? `${count}+ locations nationwide` : 'A growing national network'
  const body =
    count != null
      ? `Join ${count}+ active locations across the country.`
      : 'Join active locations across the country.'

  return (
    <section id="national-network" className="bg-black px-6 py-16 text-text-inverse sm:py-24">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="font-heading text-3xl font-bold sm:text-4xl">{headline}</h2>
        <p className="mt-3 font-serif text-lg text-text-inverse/80">{body}</p>

        {/* National map placeholder — branded markers (no default blue), pending assets. */}
        <div className="mt-10 flex min-h-[18rem] items-center justify-center rounded-xl border border-text-inverse/15 text-sm text-text-inverse/40">
          National network map — pending
        </div>
      </div>
    </section>
  )
}
