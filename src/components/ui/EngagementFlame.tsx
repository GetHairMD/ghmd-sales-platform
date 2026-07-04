import { Flame } from 'lucide-react';
import { cn } from '@/design/cn';

export type EngagementLevel = 'none' | 'low' | 'medium' | 'high';

interface EngagementFlameProps {
  level: EngagementLevel;
  /** Show the level word next to the flame. */
  showLabel?: boolean;
  className?: string;
}

// Buyer-engagement heat (Proposal Page activity, stage >= 5). Intensity via token color.
const tone: Record<EngagementLevel, string> = {
  none: 'text-mist',
  low: 'text-shadow',
  medium: 'text-accent',
  high: 'text-error',
};

const label: Record<EngagementLevel, string> = {
  none: 'No activity',
  low: 'Low',
  medium: 'Warm',
  high: 'Hot',
};

/** Engagement flame (PRD §3.1, §4.3) — renders heat for stage-≥5 cards. */
export default function EngagementFlame({ level, showLabel = false, className }: EngagementFlameProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      title={label[level]}
      aria-label={`Engagement: ${label[level]}`}
    >
      <Flame
        className={cn('h-4 w-4', tone[level])}
        strokeWidth={2}
        fill={level === 'high' || level === 'medium' ? 'currentColor' : 'none'}
        aria-hidden="true"
      />
      {showLabel && (
        <span className="font-heading text-xs uppercase tracking-caps text-text-muted">{label[level]}</span>
      )}
    </span>
  );
}
