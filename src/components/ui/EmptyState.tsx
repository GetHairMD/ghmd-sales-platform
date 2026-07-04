import { Inbox } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/design/cn';

interface EmptyStateProps {
  /** Lucide icon component; defaults to Inbox. */
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** One recommended action (e.g. a <Button>). */
  action?: ReactNode;
  className?: string;
}

/** Designed empty state with one action (PRD §4.4 — never a blank void). */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-mist',
        'bg-bg px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mist">
        <Icon className="h-6 w-6 text-text-muted" />
      </span>
      <div>
        <h3 className="font-heading text-base text-text">{title}</h3>
        {description && <p className="mt-1 font-body text-sm text-text-muted">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
