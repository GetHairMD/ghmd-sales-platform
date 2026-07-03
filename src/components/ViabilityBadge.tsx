import type { SizingResult, ViabilityLevel } from '@/lib/territory-sizing'
import { viabilityLevel } from '@/lib/territory-sizing'

/**
 * INTERNAL-ONLY viability indicator. Shows the explicit red/yellow/green call reps are
 * allowed to see — including "below floor". Never render this on the prospect-facing page.
 */

const STYLES: Record<ViabilityLevel, { box: string; dot: string; label: string }> = {
  green: { box: 'bg-green-50 border-green-200 text-green-800', dot: 'bg-green-500', label: 'Viable' },
  yellow: { box: 'bg-amber-50 border-amber-200 text-amber-800', dot: 'bg-amber-500', label: 'Marginal' },
  red: { box: 'bg-red-50 border-red-200 text-red-800', dot: 'bg-red-500', label: 'Below Floor' },
}

export default function ViabilityBadge({ sizing }: { sizing: SizingResult }) {
  const level = viabilityLevel(sizing)
  const s = STYLES[level]
  const base = sizing.scenarios.find((x) => x.key === 'base')
  const high = sizing.scenarios.find((x) => x.key === 'high')

  const detail =
    level === 'green'
      ? `Base scenario (${Math.round(base?.customers ?? 0)}) clears the ${sizing.customersNeeded}-customer floor.`
      : level === 'yellow'
      ? `Base scenario falls short; clears the ${sizing.customersNeeded}-customer floor only at upside (${Math.round(high?.customers ?? 0)}).`
      : `Below the ${sizing.customersNeeded}-customer floor at every scenario.`

  return (
    <div className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${s.box}`}>
      <span className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
      <div>
        <p className="text-sm font-semibold">{s.label}</p>
        <p className="text-xs mt-0.5 opacity-90">{detail}</p>
      </div>
    </div>
  )
}
