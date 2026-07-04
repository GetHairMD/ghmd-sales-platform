import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { PriorityAction } from '@/lib/priority-actions';
import EmptyState from '@/components/ui/EmptyState';

/** Priority Action List (PRD §3.1) — ranked, data-derived reasons + one action each. */
export default function PriorityActionList({ actions }: { actions: PriorityAction[] }) {
  if (actions.length === 0) {
    return (
      <EmptyState
        title="Nothing needs action right now"
        description="New signals surface here as deals move and engagement comes in."
      />
    );
  }

  return (
    <ol className="divide-y divide-mist overflow-hidden rounded-lg border border-mist bg-bg">
      {actions.map((a) => (
        <li key={a.prospectId}>
          <Link
            href={`/prospects/${a.prospectId}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-mist"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-sm font-semibold text-text">{a.who}</p>
              <p className="truncate text-xs text-text-muted">{a.reason}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 font-heading text-xs uppercase tracking-caps text-primary">
              {a.action}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
