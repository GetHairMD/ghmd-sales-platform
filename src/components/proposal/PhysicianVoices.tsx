import WistiaPlayer from './WistiaPlayer'
import { PHYSICIAN_VOICES } from './constants'

/**
 * Section 10 — dark. Physician testimonial videos via Wistia (spec §6.10), with
 * the brand-restyled play button and video_play tracking handled in WistiaPlayer.
 * Server component: maps content constants to the client player.
 */
export default function PhysicianVoices({ slug }: { slug: string }) {
  return (
    <section id="physician-voices" className="bg-black px-6 py-16 text-text-inverse sm:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-heading text-3xl font-bold sm:text-4xl">Physician voices</h2>
        <p className="mt-3 max-w-2xl font-serif text-lg text-text-inverse/70">
          Hear directly from physicians in the network.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {PHYSICIAN_VOICES.map((v, i) => (
            <WistiaPlayer key={`${v.mediaId || 'pending'}-${i}`} slug={slug} mediaId={v.mediaId} title={v.title} />
          ))}
        </div>
      </div>
    </section>
  )
}
