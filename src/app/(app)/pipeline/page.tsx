import { createClient } from '@/lib/supabase/server';
import { isDealStatus } from '@/lib/pipeline-stages';
import { computePriorityActions, daysInStage, type PriorityProspect } from '@/lib/priority-actions';
import type { BoardProspect } from '@/components/pipeline/ProspectCard';
import PipelineBoard from './PipelineBoard';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const supabase = createClient();
  const [{ data: rows, error }, { data: deals }] = await Promise.all([
    supabase
      .from('prospects')
      .select(
        'id, full_name, practice_name, specialty, stage, deal_status, funding_prequal_cleared, skipped_funding_prequal, skipped_triage, stage_updated_at',
      )
      .eq('archived', false)
      .order('stage', { ascending: true }),
    supabase.from('deals').select('prospect_id, territories(name)'),
  ]);

  if (error) {
    return (
      <main className="p-6">
        <p className="text-error">Error loading pipeline: {error.message}</p>
      </main>
    );
  }

  // Map prospect → territory name (via its deal, if any).
  const territoryByProspect = new Map<string, string>();
  for (const d of deals ?? []) {
    const t = d.territories as unknown as { name: string } | { name: string }[] | null;
    const name = Array.isArray(t) ? t[0]?.name : t?.name;
    if (d.prospect_id && name) territoryByProspect.set(d.prospect_id, name);
  }

  const nowMs = Date.now();
  const list = rows ?? [];

  const boardProspects: BoardProspect[] = list.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    practice_name: r.practice_name,
    specialty: r.specialty,
    territory_name: territoryByProspect.get(r.id) ?? null,
    stage: r.stage,
    deal_status: isDealStatus(r.deal_status) ? r.deal_status : 'active',
    skipped_triage: Boolean(r.skipped_triage),
    skipped_funding_prequal: Boolean(r.skipped_funding_prequal),
    days_in_stage: daysInStage(r.stage_updated_at, nowMs),
  }));

  const priorityInput: PriorityProspect[] = list.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    practice_name: r.practice_name,
    stage: r.stage,
    deal_status: isDealStatus(r.deal_status) ? r.deal_status : 'active',
    skipped_triage: Boolean(r.skipped_triage),
    skipped_funding_prequal: Boolean(r.skipped_funding_prequal),
    funding_prequal_cleared: Boolean(r.funding_prequal_cleared),
    stage_updated_at: r.stage_updated_at,
  }));
  const priorityActions = computePriorityActions(priorityInput, nowMs);

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-6">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text">Pipeline</h1>
        <p className="mt-1 font-serif text-sm text-text-muted">
          What happened, what matters, what to do next.
        </p>
      </header>
      <PipelineBoard initialProspects={boardProspects} priorityActions={priorityActions} />
    </main>
  );
}
