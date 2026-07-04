import type { DealStatus } from '@/lib/pipeline-stages';
import { cn } from '@/design/cn';

interface HealthChipProps {
  status: DealStatus;
  className?: string;
}

// Health overlay is orthogonal to stage (PRD §2.2). Colors from tokens.
const styles: Record<DealStatus, string> = {
  active: 'bg-success/10 text-success',
  stalled: 'bg-warning/15 text-shadow',
  lost: 'bg-mist text-text-muted line-through',
};

const label: Record<DealStatus, string> = {
  active: 'Active',
  stalled: 'Stalled',
  lost: 'Lost',
};

/** Deal health chip — active / stalled / lost (PRD §4.3, §4.5). */
export default function HealthChip({ status, className }: HealthChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5',
        'font-heading text-xs uppercase tracking-caps',
        styles[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label[status]}
    </span>
  );
}
