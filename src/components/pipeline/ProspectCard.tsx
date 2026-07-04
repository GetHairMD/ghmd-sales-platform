import Link from 'next/link';
import {
  showPrequalSkippedBadge,
  showTriageSkippedBadge,
  STAGE,
  type DealStatus,
} from '@/lib/pipeline-stages';
import { cn } from '@/design/cn';
import SkipBadge from '@/components/ui/SkipBadge';
import TriageChip from '@/components/ui/TriageChip';
import HealthChip from '@/components/ui/HealthChip';
import EngagementFlame from '@/components/ui/EngagementFlame';

export interface BoardProspect {
  id: string;
  full_name: string;
  practice_name: string | null;
  specialty: string | null;
  territory_name: string | null;
  stage: number;
  deal_status: DealStatus;
  skipped_triage: boolean;
  skipped_funding_prequal: boolean;
  days_in_stage: number;
}

/** Pipeline card (PRD §3.1). Presentational — drag handling lives in the board. */
export default function ProspectCard({
  prospect,
  dragging = false,
}: {
  prospect: BoardProspect;
  dragging?: boolean;
}) {
  const stalled = prospect.deal_status === 'stalled';
  const prequalSkipped = showPrequalSkippedBadge(prospect.stage, prospect.skipped_funding_prequal);
  const triageSkipped = showTriageSkippedBadge(prospect.stage, prospect.skipped_triage);

  return (
    <div
      className={cn(
        'rounded-lg border bg-bg p-3 shadow-sm transition-shadow',
        dragging && 'shadow-lg ring-2 ring-primary/30',
        stalled ? 'border-l-4 border-l-warning border-y-mist border-r-mist' : 'border-mist',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-heading text-sm font-semibold leading-tight text-text">
          {prospect.practice_name ?? prospect.full_name}
        </p>
        {prospect.stage >= STAGE.PROPOSAL_SENT && <EngagementFlame level="none" />}
      </div>
      <p className="mt-0.5 truncate text-xs text-text-muted">
        {prospect.full_name}
        {prospect.specialty ? ` · ${prospect.specialty}` : ''}
      </p>
      {prospect.territory_name && (
        <p className="mt-0.5 truncate text-xs text-text-muted">◈ {prospect.territory_name}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <TriageChip fit={null} />
        {stalled && <HealthChip status="stalled" />}
        {triageSkipped && <SkipBadge variant="triage" />}
        {prequalSkipped && <SkipBadge variant="prequal" />}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {prospect.days_in_stage}d in stage
        </span>
        <Link
          href={`/prospects/${prospect.id}`}
          className="font-heading text-xs uppercase tracking-caps text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Open
        </Link>
      </div>
    </div>
  );
}
