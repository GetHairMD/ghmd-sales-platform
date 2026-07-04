import type { HTMLAttributes } from 'react';
import { cn } from '@/design/cn';

type Padding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
  /** Adds hover elevation + pointer affordance for clickable cards. */
  interactive?: boolean;
}

const padding: Record<Padding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

/** Surface container (PRD §4.3) — white, subtle border + elevation. */
export default function Card({
  padding: pad = 'md',
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-mist bg-bg shadow-sm',
        padding[pad],
        interactive &&
          'transition-shadow duration-base ease-standard hover:shadow-md cursor-pointer',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
