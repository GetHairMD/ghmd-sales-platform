'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  stageLabel,
  showPrequalSkippedBadge,
  showTriageSkippedBadge,
  STAGE,
  type DealStatus,
} from '@/lib/pipeline-stages';
import { cn } from '@/design/cn';
import StagePill from '@/components/ui/StagePill';
import HealthChip from '@/components/ui/HealthChip';
import TriageChip from '@/components/ui/TriageChip';
import SkipBadge from '@/components/ui/SkipBadge';
import EngagementFlame from '@/components/ui/EngagementFlame';
import Button from '@/components/ui/Button';
import Tabs, { type TabItem } from '@/components/ui/Tabs';
import EmptyState from '@/components/ui/EmptyState';
import FourColumnField from '@/components/ui/FourColumnField';
import StageSelector from '@/components/StageSelector';
import DealStatusSelector from '@/components/DealStatusSelector';
import FundingPrequalToggle from '@/components/FundingPrequalToggle';
import GenerateProposalPanel from '@/components/proposal/GenerateProposalPanel';
import QualificationReviewPanel, {
  type QualificationReviewView,
} from '@/components/qualification/QualificationReviewPanel';
import type { TimelineEntry } from '@/lib/proposal/timeline';

export interface DealRoomProspect {
  id: string;
  full_name: string;
  practice_name: string | null;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  lead_source: string | null;
  assigned_rep: string | null;
  icp_score: number | null;
  notes: string | null;
  stage: number;
  deal_status: DealStatus;
  funding_prequal_cleared: boolean;
  funding_prequal_cleared_at: string | null;
  skipped_funding_prequal: boolean;
  skipped_triage: boolean;
}

const TABS: TabItem[] = [
  { key: 'action', label: 'Action' },
  { key: 'comms', label: 'Comms' },
  { key: 'calls', label: 'Calls' },
];

const TIER2_FIELDS = ['Affect / energy', 'Coachability', 'Motivation authenticity', 'Engagement', 'Chemistry / fit'];

function ctaForStage(stage: number, prospectId: string): { label: string; href?: string } {
  if (stage === STAGE.DISCOVERY_CALL_MET) return { label: 'Start Tier 2 review' };
  if (stage >= STAGE.PROPOSAL_SENT && stage <= STAGE.VALIDATION)
    return { label: 'View proposal', href: `/proposals/${prospectId}` };
  if (stage === STAGE.FUNDING_PRE_QUALIFIED) return { label: 'Send contract' };
  if (stage === STAGE.CONTRACT_SENT) return { label: 'Open Box Sign' };
  if (stage === STAGE.CONTRACT_SIGNED) return { label: 'Record funding' };
  return { label: 'Log next step' };
}

function Signal({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-mist bg-bg p-3">
      <p className="mb-1.5 font-heading text-[0.6875rem] uppercase tracking-caps text-text-muted">{label}</p>
      {children}
    </div>
  );
}

export default function DealRoom({
  prospect,
  territory,
  timeline,
  territoryArtifact = null,
  isExecutive = false,
  qualificationReview,
  qualificationExecDetail = null,
  territoryPriceControl = null,
  dealHistoryPanel = null,
}: {
  prospect: DealRoomProspect;
  territory: { name: string; addressable_patients_primary: number | null } | null;
  timeline: TimelineEntry[];
  /** Read-only §D artifact, present only when the linked territory has an approved v3 boundary. */
  territoryArtifact?: React.ReactNode;
  isExecutive?: boolean;
  qualificationReview: QualificationReviewView;
  /** Exec-only qualification detail node (scores/enrichment/grades); null for reps. */
  qualificationExecDetail?: React.ReactNode;
  /** Exec-only territory-price / discount entry node (§4D); null for reps. */
  territoryPriceControl?: React.ReactNode;
  /** Multi-deal history + add-another-territory (§6/§7); rendered for every viewer. */
  dealHistoryPanel?: React.ReactNode;
}) {
  const [tab, setTab] = useState('action');

  const prequalSkipped = showPrequalSkippedBadge(prospect.stage, prospect.skipped_funding_prequal);
  const triageSkipped = showTriageSkippedBadge(prospect.stage, prospect.skipped_triage);
  const cta = ctaForStage(prospect.stage, prospect.id);

  const capital = prospect.funding_prequal_cleared
    ? { tone: 'text-success', text: 'Cleared' }
    : prospect.skipped_funding_prequal
      ? { tone: 'text-warning', text: 'Skipped' }
      : { tone: 'text-text-muted', text: 'Pending' };

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-6">
      <Link href="/pipeline" className="font-heading text-xs uppercase tracking-caps text-primary hover:underline">
        ← Pipeline
      </Link>

      {/* Header */}
      <header className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-mist pb-4">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-bold text-text">
            {prospect.practice_name ?? prospect.full_name}
          </h1>
          <p className="text-sm text-text-muted">
            {prospect.full_name}
            {prospect.specialty ? ` · ${prospect.specialty}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StagePill stage={prospect.stage} showProgress />
          <HealthChip status={prospect.deal_status} />
          {triageSkipped && <SkipBadge variant="triage" />}
          {prequalSkipped && <SkipBadge variant="prequal" />}
          {cta.href ? (
            <Link href={cta.href}>
              <Button size="sm">{cta.label}</Button>
            </Link>
          ) : (
            <Button size="sm">{cta.label}</Button>
          )}
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 min-[1280px]:grid-cols-[280px_1fr_320px]">
        {/* LEFT — Context + three-signal block */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-mist bg-bg p-4">
            <dl className="space-y-2 text-sm">
              {prospect.email && (<div><dt className="text-xs uppercase tracking-caps text-text-muted">Email</dt><dd className="text-text">{prospect.email}</dd></div>)}
              {prospect.phone && (<div><dt className="text-xs uppercase tracking-caps text-text-muted">Phone</dt><dd className="text-text">{prospect.phone}</dd></div>)}
              <div><dt className="text-xs uppercase tracking-caps text-text-muted">Territory</dt><dd className="text-text">{territory?.name ?? 'Not assigned'}</dd></div>
              <div><dt className="text-xs uppercase tracking-caps text-text-muted">Assigned</dt><dd className="text-text">{prospect.assigned_rep ?? '—'}</dd></div>
            </dl>
            {!territoryArtifact && (
              <div className="mt-3 flex h-24 items-center justify-center rounded-md bg-mist text-xs text-text-muted">
                Territory mini-map
              </div>
            )}
          </div>

          {territoryArtifact}

          {/* Three-signal block — never blended (PRD §3.2) */}
          <div className="space-y-2">
            <Signal label="Triage">
              <TriageChip fit={null} evidence={<span>No triage yet — renders after Tier 2 completes and no field is low-confidence.</span>} />
              <p className="mt-1 text-xs text-text-muted">Tier 1 pending · Tier 2 pending</p>
            </Signal>
            <Signal label="Territory score">
              <p className="font-heading text-lg font-bold text-text">
                {territory?.addressable_patients_primary != null
                  ? territory.addressable_patients_primary.toLocaleString()
                  : '—'}
              </p>
              <p className="text-xs text-text-muted">Addressable households (primary zone)</p>
            </Signal>
            <Signal label="Capital status">
              <p className={cn('font-heading text-sm uppercase tracking-caps', capital.tone)}>{capital.text}</p>
            </Signal>
          </div>

          <Signal label="Top objections">
            <p className="text-sm text-text-muted">None extracted yet.</p>
          </Signal>
        </aside>

        {/* CENTER — Workspace */}
        <section>
          <Tabs tabs={TABS} value={tab} onValueChange={setTab} />
          <div className="pt-4">
            {tab === 'action' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-mist bg-bg p-4">
                  <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Current stage</p>
                  <p className="mt-1 font-heading text-lg text-text">{prospect.stage}. {stageLabel(prospect.stage)}</p>
                  <div className="mt-4 space-y-3">
                    <StageSelector
                      prospectId={prospect.id}
                      currentStage={prospect.stage}
                      fundingPrequalCleared={prospect.funding_prequal_cleared}
                      skippedFundingPrequal={prospect.skipped_funding_prequal}
                      skippedTriage={prospect.skipped_triage}
                    />
                    <DealStatusSelector prospectId={prospect.id} currentStatus={prospect.deal_status} />
                    <FundingPrequalToggle
                      prospectId={prospect.id}
                      cleared={prospect.funding_prequal_cleared}
                      clearedAt={prospect.funding_prequal_cleared_at}
                    />
                  </div>
                </div>
                {/* Exec-only: record/negotiate the territory price BEFORE close. The
                    close (StageSelector above) is DB-blocked until a price exists. */}
                {territoryPriceControl}
                {/* §6/§7 — every territory negotiation this customer holds, with
                    per-deal controls (exec) and add-another-territory (assigned
                    rep or exec). */}
                {dealHistoryPanel}
                {prospect.stage >= STAGE.DISCOVERY_CALL_MET && (
                  <>
                    <QualificationReviewPanel
                      prospectId={prospect.id}
                      isExecutive={isExecutive}
                      initial={qualificationReview}
                    />
                    {qualificationExecDetail}
                  </>
                )}
                <GenerateProposalPanel prospectId={prospect.id} />
                {prospect.notes && (
                  <div className="rounded-lg border border-mist bg-bg p-4">
                    <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Notes</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text">{prospect.notes}</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'comms' && (
              <EmptyState
                title="Outbound drafter"
                description="Grounded in transcript + engagement data. Nothing sends without your click — manual in v1, automation in v2."
              />
            )}

            {tab === 'calls' && (
              <div className="space-y-4">
                <EmptyState title="No recording yet" description="Discovery recordings + word-timed transcript appear here once capture is live (P2)." />
                <div className="rounded-lg border border-mist bg-bg p-4">
                  <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Tier 2 Review Queue</p>
                  <p className="mb-2 mt-1 text-xs text-text-muted">
                    Judgment-only fields for human entry. Low-confidence fields block triage. 24h SLA.
                  </p>
                  <div>
                    {TIER2_FIELDS.map((f) => (
                      <FourColumnField key={f} label={f} pending />
                    ))}
                  </div>
                  <p className="mt-3 border-t border-mist pt-2 text-xs text-text-muted">
                    Adjacent: <span className="font-semibold text-text">Salesperson Scorecard</span> (call_scores) — the seller&apos;s own call performance, separate from operator scoring.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT — Timeline & Engagement */}
        <aside className="space-y-4">
          <div className="rounded-lg border border-mist bg-bg p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Engagement</p>
              {prospect.stage >= STAGE.PROPOSAL_SENT && <EngagementFlame level="none" showLabel />}
            </div>
            <p className="text-xs text-text-muted">
              {prospect.stage >= STAGE.PROPOSAL_SENT
                ? 'No proposal views yet. Section views, dwell, and CTA clicks appear here in near-real-time.'
                : 'Engagement tracking begins once a proposal is sent.'}
            </p>
          </div>

          <div className="rounded-lg border border-mist bg-bg p-4">
            <p className="mb-3 font-heading text-xs uppercase tracking-caps text-text-muted">Timeline</p>
            {timeline.length === 0 ? (
              <p className="text-sm text-text-muted">No activity yet.</p>
            ) : (
              <ol className="space-y-3">
                {timeline.map((e) => (
                  <li
                    key={e.id}
                    className={cn('border-l-2 pl-3', e.hot ? 'border-accent' : 'border-mist')}
                  >
                    <p className="text-sm text-text">
                      {e.title}
                      {e.detail && <span className="text-text-muted"> — {e.detail}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {new Date(e.at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
