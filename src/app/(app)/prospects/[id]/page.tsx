import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { notFound } from 'next/navigation';
import { isDealStatus } from '@/lib/pipeline-stages';
import { isDiscountReason } from '@/lib/rep-command-center/metrics';
import { getProspectTimelineSources } from '@/lib/dashboard/data';
import { getViewerDesignation } from '@/lib/auth/internal-role';
import TerritoryPriceControl from './TerritoryPriceControl';
import { buildTimeline } from '@/lib/proposal/timeline';
import { resolveProspectTerritory } from '@/lib/territories/v3-display';
import { isQualificationRecommendation } from '@/lib/qualification/recommendation';
import LeadTerritoryArtifact from '@/components/territory/LeadTerritoryArtifact';
import QualificationExecDetail from '@/components/qualification/QualificationExecDetail';
import type { QualificationReviewView } from '@/components/qualification/QualificationReviewPanel';
import DealHistoryPanel, { type DealHistoryRow } from '@/components/deals/DealHistoryPanel';
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
    { data: allDeals },
    { data: reservedTerritory },
    timelineSources,
    designation,
    // Rep-SAFE qualification reads only: the review record (rep_read_own) + the rep's
    // own note (rep_select_own). The exec-only scores, enrichment, and rep-call-grade
    // tables are NEVER queried here — they live solely in QualificationExecDetail,
    // rendered below only for executives (brief §1/§5).
    { data: review },
    { data: repNote },
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
    // §6 — the FULL deal list for the history panel (multi-deal build). The
    // single-deal read above stays: it feeds the header chip / territory artifact,
    // which genuinely wants one "primary territory" summary (most-recent deal),
    // per the resolveProspectTerritory call-site review the brief required.
    // Discount columns are NOT selected here — they are client-revoked; the
    // exec-only enrichment below reads them via the service client.
    supabase
      .from('deals')
      .select('id, stage, deal_status, territory_price, funded_won_at, created_at, territory_id, territories(name)')
      .eq('prospect_id', params.id)
      .order('created_at', { ascending: true }),
    // reserved_for is a dead column (never populated); queried only to flag a future
    // disagreement with the authoritative deal link (§D / AC8) — not used as a source.
    supabase.from('territories').select('id').eq('reserved_for', params.id).limit(1).maybeSingle(),
    // proposal_* tables are service-role-only (RLS) — read via the service client.
    getProspectTimelineSources(params.id),
    getViewerDesignation(),
    supabase
      .from('qualification_reviews')
      .select('recommendation, ai_summary, notes, reviewed_at')
      .eq('prospect_id', params.id)
      .maybeSingle(),
    supabase
      .from('qualification_review_notes')
      .select('note')
      .eq('prospect_id', params.id)
      .maybeSingle(),
  ]);

  if (error || !prospect) notFound();

  const isExecutive = designation === 'executive';
  const recRaw = review?.recommendation;
  const qualificationReview: QualificationReviewView = {
    recommendation: isQualificationRecommendation(recRaw) ? recRaw : null,
    ai_summary: review?.ai_summary ?? null,
    exec_notes: review?.notes ?? null,
    reviewed_at: review?.reviewed_at ?? null,
    rep_note: repNote?.note ?? null,
  };

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

  // Executive-only territory-price / discount entry (§4D). Built ONLY in the exec
  // branch, so a rep session never constructs it. The current price/reason are read
  // via the SERVICE client because the discount columns are revoked from every client
  // column-grant (migration 20260716120000) — an exec's own authenticated client
  // cannot select discount_reason. Same server-role-behind-the-exec-gate pattern as
  // the Rep Command Center.
  let territoryPriceControl: React.ReactNode = null;
  if (isExecutive) {
    const service = createServiceClient();
    const { data: priceRow } = await service
      .from('deals')
      .select('territory_price, discount_reason')
      .eq('prospect_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const reasonRaw = priceRow?.discount_reason ?? null;
    territoryPriceControl = (
      <TerritoryPriceControl
        prospectId={params.id}
        currentPrice={priceRow?.territory_price != null ? Number(priceRow.territory_price) : null}
        currentReason={isDiscountReason(reasonRaw) ? reasonRaw : null}
      />
    );
  }

  // ── §6/§7 — deal-history panel + add-another-territory ─────────────────────
  // Base rows come from the viewer's own authenticated client (RLS/grants apply).
  // Discount facts are exec-only enrichment via the service client — the columns
  // are revoked from every client grant (20260716120000 §6), same pattern as
  // TerritoryPriceControl above.
  type AllDealRow = {
    id: string;
    stage: number;
    deal_status: string;
    territory_price: number;
    funded_won_at: string | null;
    created_at: string;
    territory_id: string | null;
    territories: { name: string } | { name: string }[] | null;
  };
  const discountByDeal = new Map<string, { reason: string | null; authorizer: string | null }>();
  if (isExecutive && (allDeals ?? []).length > 0) {
    const service = createServiceClient();
    const { data: discountRows } = await service
      .from('deals')
      .select('id, discount_reason, discount_authorized_by')
      .eq('prospect_id', params.id);
    const authorizerIds = Array.from(
      new Set(
        (discountRows ?? [])
          .map((r) => r.discount_authorized_by as string | null)
          .filter((v): v is string => v != null),
      ),
    );
    const nameById = new Map<string, string>();
    if (authorizerIds.length > 0) {
      const { data: authorizers } = await service
        .from('internal_users')
        .select('user_id, full_name')
        .in('user_id', authorizerIds);
      for (const a of authorizers ?? []) {
        if (a.full_name) nameById.set(a.user_id, a.full_name);
      }
    }
    for (const r of discountRows ?? []) {
      discountByDeal.set(r.id, {
        reason: (r.discount_reason as string | null) ?? null,
        authorizer: r.discount_authorized_by
          ? (nameById.get(r.discount_authorized_by) ?? 'Unknown authorizer')
          : null,
      });
    }
  }
  const dealHistoryRows: DealHistoryRow[] = ((allDeals ?? []) as AllDealRow[]).map((d) => {
    const tRow = Array.isArray(d.territories) ? (d.territories[0] ?? null) : d.territories;
    return {
      id: d.id,
      stage: d.stage,
      deal_status: d.deal_status,
      territory_price: Number(d.territory_price),
      funded_won_at: d.funded_won_at,
      created_at: d.created_at,
      territory_name: tRow?.name ?? null,
      discount_reason: discountByDeal.get(d.id)?.reason ?? null,
      discount_authorizer_name: discountByDeal.get(d.id)?.authorizer ?? null,
    };
  });

  // §7 gate for the add-another affordance: assigned rep or executive. The
  // database re-enforces this inside create_territory_deal() — this only decides
  // whether the button is enabled or visibly disabled (never an unhandled error).
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const canAddTerritory =
    isExecutive || (designation === 'rep' && viewer?.id != null && prospect.assigned_rep_id === viewer.id);

  const dealHistoryPanel = (
    <DealHistoryPanel
      prospectId={params.id}
      deals={dealHistoryRows}
      isExecutive={isExecutive}
      canAddTerritory={canAddTerritory}
    />
  );

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
      isExecutive={isExecutive}
      qualificationReview={qualificationReview}
      // Exec-only detail (scores / enrichment / rep-call grades). Rendered ONLY inside
      // this executive branch — never constructed for a rep session.
      qualificationExecDetail={isExecutive ? <QualificationExecDetail prospectId={params.id} /> : null}
      // Exec-only territory-price / discount entry (§4D). Null for reps.
      territoryPriceControl={territoryPriceControl}
      // §6/§7 — multi-deal history + add-another-territory (all viewers; controls
      // inside are exec/assigned-rep gated).
      dealHistoryPanel={dealHistoryPanel}
    />
  );
}
