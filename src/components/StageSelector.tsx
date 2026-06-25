'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const STAGES = [
  { id: 1, label: 'New Lead' },
  { id: 2, label: 'Contacted' },
  { id: 3, label: 'Discovery Call' },
  { id: 4, label: 'Proposal Sent' },
  { id: 5, label: 'LOI Signed' },
  { id: 6, label: 'FDD Delivered' },
  { id: 7, label: 'Agreement Signed' },
]

export default function StageSelector({
  prospectId,
  currentStage,
}: {
  prospectId: string
  currentStage: number
}) {
  const [stage, setStage] = useState(currentStage)
  const [saving, setSaving] = useState(false)

  async function handleChange(newStage: number) {
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('prospects')
      .update({ stage: newStage, stage_updated_at: new Date().toISOString() })
      .eq('id', prospectId)
    setStage(newStage)
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
        {STAGES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id}. {s.label}
          </option>
        ))}
      </select>
      {saving && <span className="text-xs text-gray-400">Saving…</span>}
    </div>
  )
}
