import dynamic from 'next/dynamic'

// Client + mapbox-gl (touches `window` at import time) → never SSR. Same pattern as
// the territory detail maps. Lives in the (app) route group so it renders inside the
// authenticated app shell.
const NationalStatusMap = dynamic(() => import('@/components/NationalStatusMap'), { ssr: false })

export const metadata = {
  title: 'National Map — GHMD Sales',
}

/**
 * Standalone national status map (decision #121 / #122 / #132) — distinct from Deal
 * Territories (/territories). Visible to all reps and executives; read-only, no
 * status editing, no click-through to prospect/deal records.
 */
export default function NationalMapPage() {
  return (
    <main className="p-6">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text">National Territory Status</h1>
        <p className="mt-1 text-sm text-text-muted">
          Every territory at a glance — sold, in pipeline, or available.
        </p>
      </header>
      <NationalStatusMap />
    </main>
  )
}
