import { addressableFloorStatus } from '@/lib/territories/v3-display'

/**
 * The v3 headline shown everywhere a v3 result appears (AC2): addressable market measured
 * against the 18,600 addressable floor. NEVER shows drive-time minutes. Internal surfaces
 * only (territory detail, exec preview, Lead-profile artifact) — not the prospect-facing
 * proposal page.
 */
export default function AddressableVsFloor({
  addressable,
  label = 'Addressable Market',
}: {
  addressable: number
  label?: string
}) {
  const s = addressableFloorStatus(addressable)
  return (
    <div className="rounded-xl bg-primary p-5 text-white">
      <p className="mb-1 font-heading text-xs uppercase tracking-caps text-white/70">{label}</p>
      <p className="font-heading text-4xl font-bold tabular-nums">{s.addressable.toLocaleString()}</p>
      <p className="mt-2 text-sm text-white/80">
        {s.clears ? (
          <>
            <span className="font-semibold">{Math.abs(s.delta).toLocaleString()} above</span> the{' '}
            {s.floor.toLocaleString()} addressable floor
          </>
        ) : (
          <>
            <span className="font-semibold">{Math.abs(s.delta).toLocaleString()} below</span> the{' '}
            {s.floor.toLocaleString()} addressable floor
          </>
        )}
      </p>
    </div>
  )
}
