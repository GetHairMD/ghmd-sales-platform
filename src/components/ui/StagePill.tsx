import { stageLabel, LAST_STAGE, FIRST_STAGE } from '@/lib/pipeline-stages';
import { cn } from '@/design/cn';

interface StagePillProps {
  /** prospects.stage integer (1-based). */
  stage: number;
  /** Append "n / total" progress (denominator is LAST_STAGE). */
  showProgress?: boolean;
  className?: string;
}

/**
 * Stage-aware pill (PRD §4.3). Reads its label from pipeline-stages.ts —
 * never hardcodes a stage number or string.
 */
export default function StagePill({ stage, showProgress = false, className }: StagePillProps) {
  const inRange = stage >= FIRST_STAGE && stage <= LAST_STAGE;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1',
        'font-heading text-xs uppercase tracking-caps text-text',
        className,
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', inRange ? 'bg-primary' : 'bg-shadow')}
        aria-hidden="true"
      />
      {stageLabel(stage)}
      {showProgress && (
        <span className="text-text-muted">
          {stage} / {LAST_STAGE}
        </span>
      )}
    </span>
  );
}
