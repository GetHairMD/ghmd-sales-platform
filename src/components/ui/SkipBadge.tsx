import { AlertTriangle } from 'lucide-react';
import { cn } from '@/design/cn';

export type SkipVariant = 'prequal' | 'triage';

interface SkipBadgeProps {
  variant: SkipVariant;
  className?: string;
}

// Persistent amber badge recording a deliberate soft-gate skip (PRD §2.3, §3.1).
const label: Record<SkipVariant, string> = {
  prequal: 'PRE-QUAL SKIPPED',
  triage: 'TRIAGE SKIPPED',
};

/**
 * Amber skip badge — impossible-to-miss marker that a soft gate was skipped.
 * `prequal` mirrors skipped_funding_prequal; `triage` mirrors skipped_triage.
 */
export default function SkipBadge({ variant, className }: SkipBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/15 px-2 py-0.5',
        'font-heading text-[0.6875rem] uppercase tracking-caps text-shadow',
        className,
      )}
    >
      <AlertTriangle className="h-3 w-3 text-warning" strokeWidth={2} aria-hidden="true" />
      {label[variant]}
    </span>
  );
}
