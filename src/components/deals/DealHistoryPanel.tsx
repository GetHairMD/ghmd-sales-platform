'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  PIPELINE_STAGES,
  DEAL_STATUSES,
  stageLabel,
  isDealStatus,
  type DealStatus,
} from '@/lib/pipeline-stages';
import { cn } from '@/design/cn';
import StagePill from '@/components/ui/StagePill';
import HealthChip from '@/components/ui/HealthChip';
import Button from '@/components/ui/Button';
import TerritoryPickerDialog from './TerritoryPickerDialog';
import { moveDealStage, setDealStatus } from '@/app/(app)/prospects/[id]/deal-actions';

/** One deal row, serialized by the server page. Discount fields are populated
 *  ONLY for executive sessions (the columns are client-revoked; the page reads
 *  them via the service client inside its exec-only branch). */
export interface DealHistoryRow {
  id: string;
  stage: number;
  deal_status: string;
  territory_price: number;
  funded_won_at: string | null;
  created_at: string;
  territory_name: string | null;
  discount_reason: string | null;
  discount_authorizer_name: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * §6 — Deal history: every territory negotiation this customer holds, visually
 * split active / closed / lost-stalled. Per-deal stage + status controls render
 * for executives only (the DB enforces the same gate — a missing control is not
 * the security boundary, move_deal_stage()/set_deal_status() are).
 *
 * §7 — Add-another-territory: enabled for the prospect's assigned rep and for
 * executives; otherwise a clearly disabled affordance (never a crash — the
 * standing "no DB-level check assigned_rep_id → designation" gap is not fixed
 * here, just never allowed to produce an unhandled error).
 */
export default function DealHistoryPanel({
  prospectId,
  deals,
  isExecutive,
  canAddTerritory,
}: {
  prospectId: string;
  deals: DealHistoryRow[];
  isExecutive: boolean;
  canAddTerritory: boolean;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onMoveStage(deal: DealHistoryRow, target: number) {
    setError(null);
    startTransition(async () => {
      let res = await moveDealStage(prospectId, deal.id, target);
      if (res.requiresConfirm === 'prequal') {
        const go = window.confirm(
          'Funding pre-qual has not been cleared for this customer. Advance this deal anyway? The skip will be flagged on the record.',
        );
        if (!go) return;
        res = await moveDealStage(prospectId, deal.id, target, { prequal: true });
      }
      if (!res.ok) setError(res.error ?? 'Could not move the deal.');
      else router.refresh();
    });
  }

  function onSetStatus(deal: DealHistoryRow, status: string) {
    setError(null);
    startTransition(async () => {
      const res = await setDealStatus(prospectId, deal.id, status);
      if (!res.ok) setError(res.error ?? 'Could not update the deal status.');
      else router.refresh();
    });
  }

  const closed = (d: DealHistoryRow) => d.funded_won_at != null;
  const tone = (d: DealHistoryRow) =>
    d.deal_status === 'lost'
      ? 'opacity-60'
      : closed(d)
        ? 'border-success/40'
        : d.deal_status === 'stalled'
          ? 'border-warning/40'
          : 'border-mist';

  return (
    <div className="rounded-lg border border-mist bg-bg p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-xs uppercase tracking-caps text-text-muted">
          Territory deals ({deals.length})
        </p>
        {canAddTerritory ? (
          <Button size="sm" onClick={() => setPickerOpen(true)} disabled={pending}>
            Add territory
          </Button>
        ) : (
          <span
            className="cursor-not-allowed font-heading text-xs uppercase tracking-caps text-text-muted"
            title="Only the assigned rep or an executive can add a territory deal."
          >
            Add territory
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-warning">{error}</p>}

      {deals.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">
          No territory deals yet — one is created automatically when a price is recorded or the
          deal closes, or add a territory to start one.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {deals.map((d) => (
            <li key={d.id} className={cn('rounded-lg border bg-bg p-3', tone(d))}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-heading text-sm font-bold text-text">
                    {d.territory_name ?? 'No territory linked'}
                  </p>
                  <p className="text-xs text-text-muted">
                    Opened {fmtDate(d.created_at)}
                    {closed(d) && ` · Closed ${fmtDate(d.funded_won_at)}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StagePill stage={d.stage} />
                  <HealthChip
                    status={isDealStatus(d.deal_status) ? (d.deal_status as DealStatus) : 'active'}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-text">
                  {usd.format(d.territory_price)}
                  {isExecutive && d.discount_reason && (
                    <span className="ml-2 text-xs text-text-muted">
                      discounted · {d.discount_reason.replaceAll('_', ' ')}
                      {d.discount_authorizer_name && ` · authorized by ${d.discount_authorizer_name}`}
                    </span>
                  )}
                </p>

                {isExecutive && (
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`deal-stage-${d.id}`}>
                      Stage for {d.territory_name ?? 'deal'}
                    </label>
                    <select
                      id={`deal-stage-${d.id}`}
                      value={d.stage}
                      disabled={pending}
                      onChange={(e) => onMoveStage(d, Number(e.target.value))}
                      className="rounded-md border border-mist bg-bg px-2 py-1 text-xs text-text disabled:opacity-50"
                    >
                      {PIPELINE_STAGES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id}. {stageLabel(s.id)}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`deal-status-${d.id}`}>
                      Status for {d.territory_name ?? 'deal'}
                    </label>
                    <select
                      id={`deal-status-${d.id}`}
                      value={isDealStatus(d.deal_status) ? d.deal_status : 'active'}
                      disabled={pending}
                      onChange={(e) => onSetStatus(d, e.target.value)}
                      className="rounded-md border border-mist bg-bg px-2 py-1 text-xs text-text disabled:opacity-50"
                    >
                      {DEAL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <TerritoryPickerDialog prospectId={prospectId} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}
