'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PIPELINE_STAGES, requiresFundingPrequalConfirm } from '@/lib/pipeline-stages'

export default function StageSelector({
  prospectId,
  currentStage,
  fundingPrequalCleared,
  skippedFundingPrequal,
}: {
  prospectId: string
  currentStage: number
  fundingPrequalCleared: boolean
  skippedFundingPrequal: boolean
}) {
  const [stage, setStage] = useState(currentStage)
  const [skipped, setSkipped] = useState(skippedFundingPrequal)
  const [saving, setSaving] = useState(false)

  async function handleChange(newStage: number) {
    // Soft funding gate: advancing to Contract Sent (8) or beyond without cleared
    // pre-qual is allowed, but confirm first and flag the record. Never a hard block.
    let markSkipped = skipped
    if (requiresFundingPrequalConfirm(newStage, fundingPrequalCleared)) {
      const proceed = window.confirm('Funding pre-qual not cleared. Advance anyway?')
      if (!proceed) return // leave the select on its current value
      markSkipped = true
    }

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('prospects')
      .update({
        stage: newStage,
        stage_updated_at: new Date().toISOString(),
        ...(markSkipped !== skipped ? { skipped_funding_prequal: markSkipped } : {}),
      })
      .eq('id', prospectId)

    if (!error) {
      setStage(newStage)
      setSkipped(markSkipped)
    }
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-500 font-medium">Stage</label>
      <select
        value={stage}
        onChange={(e) => handleChange(parseInt(e.target.value, 10))}
        disabled={saving}
        className="border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#4681A3] disabled:opacity-50"
      >
        {PIPELINE_STAGES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id}. {s.label}
          </option>
        ))}
      </select>
      {saving && <span className="text-xs text-gray-400">Saving…</span>}
    </div>
  )
}
