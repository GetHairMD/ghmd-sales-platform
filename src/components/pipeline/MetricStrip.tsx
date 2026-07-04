'use client';

import { cn } from '@/design/cn';

export interface Metric {
  key: string;
  label: string;
  value: number;
}

/**
 * Metric strip (PRD §3.1) — up to 6 headline counts, each a filter, not a report.
 * Clicking toggles the active metric (board scrolls/filters to it).
 */
export default function MetricStrip({
  metrics,
  active,
  onSelect,
}: {
  metrics: Metric[];
  active: string | null;
  onSelect: (key: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {metrics.map((m) => {
        const isActive = active === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onSelect(isActive ? null : m.key)}
            className={cn(
              'rounded-lg border bg-bg p-3 text-left transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              isActive ? 'border-primary ring-1 ring-primary' : 'border-mist hover:border-primary/40',
            )}
          >
            <p className="font-heading text-2xl font-bold text-text">{m.value}</p>
            <p className="mt-0.5 font-heading text-[0.6875rem] uppercase tracking-caps text-text-muted">
              {m.label}
            </p>
          </button>
        );
      })}
    </div>
  );
}
