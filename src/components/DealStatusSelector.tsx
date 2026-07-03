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
    const { error } = await supabase
      .from('prospects')
      .update({ deal_status: newStatus })
      .eq('id', prospectId)
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
