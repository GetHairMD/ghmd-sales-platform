import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import StageSelector from '@/components/StageSelector'
import DealStatusSelector from '@/components/DealStatusSelector'
import FundingPrequalToggle from '@/components/FundingPrequalToggle'
import ActivityLog from '@/components/ActivityLog'
import { stageLabel, showPrequalSkippedBadge, isDealStatus } from '@/lib/pipeline-stages'

export default async function ProspectDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: prospect, error }, { data: activities }] = await Promise.all([
    supabase.from('prospects').select('*').eq('id', params.id).single(),
    supabase
      .from('activities')
      .select('id, created_at, activity_type, body, created_by')
      .eq('prospect_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (error || !prospect) notFound()

  const label = stageLabel(prospect.stage)
  const dealStatus = isDealStatus(prospect.deal_status) ? prospect.deal_status : 'active'
  const prequalSkipped = showPrequalSkippedBadge(
    prospect.stage,
    Boolean(prospect.skipped_funding_prequal),
  )

  return (
    <main className="max-w-3xl mx-auto p-8">
      <div className="flex gap-4 mb-6 text-sm">
        <Link href="/pipeline" className="text-[#4681A3] hover:underline">
          ← Pipeline
        </Link>
        <Link href="/prospects" className="text-[#4681A3] hover:underline">
          All Prospects
        </Link>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start mb-5">
          <h1 className="text-2xl font-bold text-gray-900">{prospect.full_name}</h1>
          <div className="flex flex-col items-end gap-1.5">
            <span className="bg-[#4681A3]/10 text-[#4681A3] text-sm px-3 py-1 rounded-full font-medium">
              {prospect.stage}. {label}
            </span>
            {dealStatus === 'stalled' && (
              <span className="bg-amber-100 text-amber-700 text-xs px-2.5 py-0.5 rounded-full font-medium">
                Stalled
              </span>
            )}
            {dealStatus === 'lost' && (
              <span className="bg-gray-200 text-gray-500 text-xs px-2.5 py-0.5 rounded-full font-medium line-through">
                Lost
              </span>
            )}
            {prequalSkipped && (
              <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-semibold tracking-wide">
                PRE-QUAL SKIPPED
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm mb-5">
          {prospect.email && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Email</p>
              <p className="font-medium">{prospect.email}</p>
            </div>
          )}
          {prospect.phone && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Phone</p>
              <p className="font-medium">{prospect.phone}</p>
            </div>
          )}
          {prospect.practice_name && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Practice</p>
              <p className="font-medium">{prospect.practice_name}</p>
            </div>
          )}
          {prospect.specialty && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Specialty</p>
              <p className="font-medium">{prospect.specialty}</p>
            </div>
          )}
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Source</p>
            <p className="font-medium">{prospect.lead_source}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Assigned Rep</p>
            <p className="font-medium">{prospect.assigned_rep}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">Added</p>
            <p className="font-medium">
              {new Date(prospect.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
          {prospect.icp_score != null && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">ICP Score</p>
              <p className="font-medium">{prospect.icp_score}/100</p>
            </div>
          )}
        </div>

        {prospect.notes && (
          <div className="pt-4 border-t mb-4">
            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{prospect.notes}</p>
          </div>
        )}

        <div className="pt-4 border-t space-y-3">
          <StageSelector
            prospectId={prospect.id}
            currentStage={prospect.stage}
            fundingPrequalCleared={Boolean(prospect.funding_prequal_cleared)}
            skippedFundingPrequal={Boolean(prospect.skipped_funding_prequal)}
          />
          <DealStatusSelector prospectId={prospect.id} currentStatus={dealStatus} />
          <FundingPrequalToggle
            prospectId={prospect.id}
            cleared={Boolean(prospect.funding_prequal_cleared)}
            clearedAt={prospect.funding_prequal_cleared_at ?? null}
          />
        </div>
      </div>

      <ActivityLog prospectId={prospect.id} initialActivities={activities ?? []} />
    </main>
  )
}
