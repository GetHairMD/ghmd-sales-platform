import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { isDealStatus } from '@/lib/pipeline-stages';
import { getProspectTimelineSources } from '@/lib/dashboard/data';
import { buildTimeline } from '@/lib/proposal/timeline';
import { resolveProspectTerritory } from '@/lib/territories/v3-display';
import LeadTerritoryArtifact from '@/components/territory/LeadTerritoryArtifact';
import DealRoom, { type DealRoomProspect } from './DealRoom';

/** Territory shape fetched via the prospect's most-recent deal (the authoritative link). */
interface DealTerritory {
  id: string;
  name: string;
  addressable_patients_primary: number | null;
  formula_version: number | null;
  boundary_geojson: unknown | null;
  boundary_source: { addressable?: number } | null;
  center_lat: number | null;
  center_lng: number | null;
}

export const dynamic = 'force-dynamic';

export default async function ProspectDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const [
    { data: prospect, error },
    { data: activities },
    { data: deal },
    { data: reservedTerritory },
    timelineSources,
  ] = await Promise.all([
    supabase.from('prospects').select('*').eq('id', params.id).single(),
    supabase
      .from('activities')
      .select('id, created_at, activity_type, body, created_by')
      .eq('prospect_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('deals')
      .select(
        'territory_id, territories(id, name, addressable_patients_primary, formula_version, boundary_geojson, boundary_source, center_lat, center_lng)',
      )
      .eq('prospect_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // reserved_for is a dead column (never populated); queried only to flag a future
    // disagreement with the authoritative deal link (§D / AC8) — not used as a source.
    supabase.from('territories').select('id').eq('reserved_for', params.id).limit(1).maybeSingle(),
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

  const t = deal?.territories as unknown as DealTerritory | DealTerritory[] | null;
  const dealTerritory: DealTerritory | null = Array.isArray(t) ? (t[0] ?? null) : (t ?? null);
  const territory = dealTerritory
    ? { name: dealTerritory.name, addressable_patients_primary: dealTerritory.addressable_patients_primary }
    : null;

  // §D — deals.territory_id is authoritative; flag (never silently pick) if a populated
  // reserved_for ever disagrees. reservedTerritory is null today (dead column).
  const link = resolveProspectTerritory({
    reservedForTerritoryId: reservedTerritory?.id ?? null,
    latestDealTerritoryId: deal?.territory_id ?? null,
  });
  if (link.disagree) {
    console.warn(
      `[prospects/${params.id}] reserved_for territory ${reservedTerritory?.id} disagrees with deal territory ${deal?.territory_id} — using the deal link (§D).`,
    );
  }

  // Render the read-only artifact ONLY when the linked territory has an approved v3 boundary.
  const approvedV3 =
    !!dealTerritory && dealTerritory.formula_version === 3 && dealTerritory.boundary_geojson != null;
  const territoryArtifact =
    approvedV3 && dealTerritory ? (
      <LeadTerritoryArtifact
        name={dealTerritory.name}
        addressable={
          dealTerritory.boundary_source?.addressable ??
          dealTerritory.addressable_patients_primary ??
          0
        }
        boundaryFeature={dealTerritory.boundary_geojson as GeoJSON.Feature}
        center={
          dealTerritory.center_lat != null && dealTerritory.center_lng != null
            ? { lat: Number(dealTerritory.center_lat), lng: Number(dealTerritory.center_lng) }
            : null
        }
      />
    ) : null;

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

  return (
    <DealRoom
      prospect={dr}
      territory={territory}
      timeline={timeline}
      territoryArtifact={territoryArtifact}
    />
  );
}
