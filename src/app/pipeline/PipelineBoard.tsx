'use client';

import { useMemo, useState, useTransition } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { BOARD_COLUMNS, STAGE } from '@/lib/pipeline-stages';
import type { PriorityAction } from '@/lib/priority-actions';
import { cn } from '@/design/cn';
import ProspectCard, { type BoardProspect } from '@/components/pipeline/ProspectCard';
import MetricStrip, { type Metric } from '@/components/pipeline/MetricStrip';
import PriorityActionList from '@/components/pipeline/PriorityActionList';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { moveProspectStage } from './actions';

const METRICS: { key: string; label: string; stageIds: number[] }[] = [
  { key: 'new', label: 'New Leads', stageIds: [STAGE.NEW_LEAD] },
  { key: 'discovery', label: 'Discovery', stageIds: [STAGE.DISCOVERY_CALL_SCHEDULED, STAGE.DISCOVERY_CALL_MET] },
  { key: 'proposals', label: 'Proposals Live', stageIds: [STAGE.PROPOSAL_SENT, STAGE.VALIDATION] },
  { key: 'prequal', label: 'Pre-Qualified', stageIds: [STAGE.FUNDING_PRE_QUALIFIED] },
  { key: 'contracts', label: 'Contracts Out', stageIds: [STAGE.CONTRACT_SENT, STAGE.CONTRACT_SIGNED] },
  { key: 'won', label: 'Won', stageIds: [STAGE.FUNDED_WON, STAGE.IMPLEMENTATION_HANDOFF_SCHEDULED] },
];

type StatusFilter = 'open' | 'active' | 'stalled' | 'lost';
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'active', label: 'Active' },
  { key: 'stalled', label: 'Stalled' },
  { key: 'lost', label: 'Lost' },
];

interface PendingGate {
  prospectId: string;
  targetStage: number;
  prevStage: number;
  gate: 'triage' | 'prequal';
  confirmed: { triage?: boolean; prequal?: boolean };
}

export default function PipelineBoard({
  initialProspects,
  priorityActions,
}: {
  initialProspects: BoardProspect[];
  priorityActions: PriorityAction[];
}) {
  const [prospects, setProspects] = useState(initialProspects);
  const [status, setStatus] = useState<StatusFilter>('open');
  const [metric, setMetric] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingGate | null>(null);
  const [, startTransition] = useTransition();

  const metrics: Metric[] = useMemo(
    () =>
      METRICS.map((m) => ({
        key: m.key,
        label: m.label,
        value: prospects.filter((p) => p.deal_status !== 'lost' && m.stageIds.includes(p.stage)).length,
      })),
    [prospects],
  );

  const metricStages = metric ? METRICS.find((m) => m.key === metric)?.stageIds ?? null : null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((p) => {
      if (status === 'open' && p.deal_status === 'lost') return false;
      if (status !== 'open' && p.deal_status !== status) return false;
      if (metricStages && !metricStages.includes(p.stage)) return false;
      if (q) {
        const hay = `${p.full_name} ${p.practice_name ?? ''} ${p.territory_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [prospects, status, metricStages, search]);

  function applyMove(prospectId: string, targetStage: number, confirmed: PendingGate['confirmed']) {
    const prev = prospects.find((p) => p.id === prospectId);
    if (!prev) return;
    const prevStage = prev.stage;
    setProspects((all) => all.map((p) => (p.id === prospectId ? { ...p, stage: targetStage, days_in_stage: 0 } : p)));

    startTransition(async () => {
      const res = await moveProspectStage(prospectId, targetStage, confirmed);
      if (res.requiresConfirm) {
        setProspects((all) => all.map((p) => (p.id === prospectId ? { ...p, stage: prevStage } : p)));
        setPending({ prospectId, targetStage, prevStage, gate: res.requiresConfirm, confirmed });
      } else if (!res.ok) {
        setProspects((all) => all.map((p) => (p.id === prospectId ? { ...p, stage: prevStage } : p)));
      } else {
        // Reflect any recorded skip locally so the badge appears immediately.
        setProspects((all) =>
          all.map((p) =>
            p.id === prospectId
              ? {
                  ...p,
                  skipped_triage: p.skipped_triage || Boolean(confirmed.triage),
                  skipped_funding_prequal: p.skipped_funding_prequal || Boolean(confirmed.prequal),
                }
              : p,
          ),
        );
      }
    });
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const col = BOARD_COLUMNS.find((c) => c.key === result.destination!.droppableId);
    if (!col) return;
    const prospect = prospects.find((p) => p.id === result.draggableId);
    if (!prospect) return;
    if (col.stageIds.includes(prospect.stage)) return; // already in this group
    applyMove(prospect.id, col.stageIds[0], {});
  }

  return (
    <div className="space-y-6">
      <MetricStrip metrics={metrics} active={metric} onSelect={setMetric} />

      <section>
        <h2 className="mb-2 font-heading text-sm font-semibold uppercase tracking-caps text-text-muted">
          Priority Actions
        </h2>
        <PriorityActionList actions={priorityActions} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-mist">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={cn(
                'px-3 py-1.5 font-heading text-xs uppercase tracking-caps transition-colors',
                status === f.key ? 'bg-primary text-text-inverse' : 'bg-bg text-text-muted hover:bg-mist',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prospects…"
          className="min-w-48 flex-1 rounded-lg border border-mist bg-bg px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((col) => {
            const cards = visible
              .filter((p) => col.stageIds.includes(p.stage))
              .sort((a, b) => a.stage - b.stage);
            return (
              <div key={col.key} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="font-heading text-xs font-semibold uppercase tracking-caps text-text">
                    {col.label}
                  </h3>
                  <span className="text-xs text-text-muted">{cards.length}</span>
                </div>
                <Droppable droppableId={col.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        'min-h-[60vh] space-y-2 rounded-lg bg-mist/60 p-2 transition-colors',
                        snapshot.isDraggingOver && 'bg-primary/10',
                      )}
                    >
                      {cards.map((p, i) => (
                        <Draggable key={p.id} draggableId={p.id} index={i}>
                          {(dp, ds) => (
                            <div
                              ref={dp.innerRef}
                              {...dp.draggableProps}
                              {...dp.dragHandleProps}
                              className="cursor-grab active:cursor-grabbing"
                            >
                              <ProspectCard prospect={p} dragging={ds.isDragging} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.gate === 'prequal' ? 'Funding pre-qual not cleared' : 'Triage not complete'}
        description={
          pending?.gate === 'prequal'
            ? 'Contract Sent normally follows a cleared lender pre-qual. You can advance anyway.'
            : 'This prospect has no completed Tier 2 triage. You can advance to Proposal Sent anyway.'
        }
        records={
          pending?.gate === 'prequal'
            ? 'Advancing sets a PRE-QUAL SKIPPED flag on the record.'
            : 'Advancing sets a TRIAGE SKIPPED flag on the record.'
        }
        confirmLabel="Advance anyway"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          const next = { ...pending.confirmed, [pending.gate]: true };
          const { prospectId, targetStage } = pending;
          setPending(null);
          applyMove(prospectId, targetStage, next);
        }}
      />
    </div>
  );
}
