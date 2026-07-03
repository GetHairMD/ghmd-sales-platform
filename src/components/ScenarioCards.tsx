import type { SizingResult } from '@/lib/territory-sizing'
import {
  SCENARIO_DISPLAY_LABEL,
  formatPenetrationRate,
  displayCustomers,
} from '@/lib/territory-sizing'

/**
 * Renders the three penetration scenarios (Conservative / Base / Upside) as customer
 * projections. Presentation only — takes a computed SizingResult, exposes NO formula
 * mechanics (no income thresholds, credit share, PTI, or affordability derivation).
 *
 * `internal` adds a per-card "clears floor" marker for reps. Public omits it entirely —
 * prospects see no floor/viability treatment at all.
 */

export default function ScenarioCards({
  sizing,
  internal = false,
}: {
  sizing: SizingResult
  internal?: boolean
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {sizing.scenarios.map((s) => {
        const isBase = s.key === 'base'
        const customers = displayCustomers(s.customers)
        return (
          <div
            key={s.key}
            className={`rounded-xl border p-5 ${
              isBase ? 'border-[#4681A3] bg-[#4681A3]/5' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">{SCENARIO_DISPLAY_LABEL[s.key]}</p>
              <span className="text-xs text-gray-400">{formatPenetrationRate(s.rate)}</span>
            </div>
            <p className={`text-3xl font-bold ${isBase ? 'text-[#4681A3]' : 'text-gray-900'}`}>
              {customers.toLocaleString()}
            </p>
            <p className="text-sm text-gray-500 mt-1">projected customers</p>
            {internal && (
              <p
                className={`text-xs mt-2 font-medium ${
                  s.meetsFloor ? 'text-green-600' : 'text-gray-400'
                }`}
              >
                {s.meetsFloor ? '✓ clears floor' : 'below floor'}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
