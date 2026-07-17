'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DEAL_STATUSES, type DealStatus } from '@/lib/pipeline-stages'

const STATUS_LABELS: Record<DealStatus, string> = {
  active: 'Active',
  stalled: 'Stalled',
  lost: 'Lost',
}

export default function DealStatusSelector({
  prospectId,
  currentStatus,
}: {
  prospectId: string
  currentStatus: DealStatus
}) {
  const [status, setStatus] = useState<DealStatus>(currentStatus)
  const [saving, setSaving] = useState(false)

  async function handleChange(newStatus: DealStatus) {
    setSaving(true)
    const supabase = createClient()
    // Multi-deal build: prospects.deal_status is DERIVED once deals exist, so a
    // direct prospects update would be clobbered by the next derivation pass.
    // set_customer_deal_status() routes the write correctly (no deals → prospects
    // directly; deals → every non-lost deal, roll-up re-derived) and is
    // executive-gated in the database — a rep's change is now rejected loudly
    // instead of silently no-oping under RLS as the old direct update did.
    const { error } = await supabase.rpc('set_customer_deal_status', {
      p_prospect_id: prospectId,
      p_status: newStatus,
    })
    if (!error) setStatus(newStatus)
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-500 font-medium">Deal Health</label>
      <select
        value={status}
        onChange={(e) => handleChange(e.target.value as DealStatus)}
        disabled={saving}
        className="border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#4681A3] disabled:opacity-50"
      >
        {DEAL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {saving && <span className="text-xs text-gray-400">Saving…</span>}
    </div>
  )
}
