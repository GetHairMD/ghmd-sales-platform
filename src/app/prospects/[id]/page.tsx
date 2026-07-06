import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { isDealStatus } from '@/lib/pipeline-stages';
import { getProspectTimelineSources } from '@/lib/dashboard/data';
import { buildTimeline } from '@/lib/proposal/timeline';
import DealRoom, { type DealRoomProspect } from './DealRoom';

export const dynamic = 'force-dynamic';

export default async function ProspectDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [{ data: prospect, error }, { data: activities }, { data: deal }, timelineSources] =
    await Promise.all([
      supabase.from('prospects').select('*').eq('id', params.id).single(),
      supabase
        .from('activities')
        .select('id, created_at, activity_type, body, created_by')
        .eq('prospect_id', params.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('deals')
        .select('territories(name, addressable_patients_primary)')
        .eq('prospect_id', params.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // proposal_* tables are service-role-only (RLS) — read via the service client.
      getProspectTimelineSources(params.id),
    ]);

  if (error || !prospect) notFound();

  // Merge manual notes + proposal sessions/events (incl. Calendly) into one
  // chronological timeline (spec §11). Pure merge — see lib/proposal/timeline.ts.
  const timeline = buildTimeline({
    sessions: timelineSources.sessions,
    events: timelineSources.events,
    activities: (activities ?? []).map((a) => ({
      id: a.id,
      created_at: a.created_at,
      activity_type: a.activity_type,
      body: a.body,
    })),
  });

  const t = deal?.territories as unknown as
    | { name: string; addressable_patients_primary: number | null }
    | { name: string; addressable_patients_primary: number | null }[]
    | null;
  const territory = Array.isArray(t) ? (t[0] ?? null) : (t ?? null);

  const dr: DealRoomProspect = {
    id: prospect.id,
    full_name: prospect.full_name,
    practice_name: prospect.practice_name,
    specialty: prospect.specialty,
    email: prospect.email,
    phone: prospect.phone,
    lead_source: prospect.lead_source,
    assigned_rep: prospect.assigned_rep,
    icp_score: prospect.icp_score,
    notes: prospect.notes,
    stage: prospect.stage,
    deal_status: isDealStatus(prospect.deal_status) ? prospect.deal_status : 'active',
    funding_prequal_cleared: Boolean(prospect.funding_prequal_cleared),
    funding_prequal_cleared_at: prospect.funding_prequal_cleared_at ?? null,
    skipped_funding_prequal: Boolean(prospect.skipped_funding_prequal),
    skipped_triage: Boolean(prospect.skipped_triage),
  };

  return <DealRoom prospect={dr} territory={territory} timeline={timeline} />;
}
