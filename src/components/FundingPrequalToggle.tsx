'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Manual funding pre-qual marker. The lender (iLease/Ottri) confirms pre-qual to GHMD
 * directly and corporate marks it here. cleared_at / cleared_by are set so a future
 * lender webhook can populate the same fields automatically.
 */
export default function FundingPrequalToggle({
  prospectId,
  cleared,
  clearedAt,
}: {
  prospectId: string
  cleared: boolean
  clearedAt: string | null
}) {
  const [isCleared, setIsCleared] = useState(cleared)
  const [at, setAt] = useState<string | null>(clearedAt)
  const [saving, setSaving] = useState(false)

  async function handleToggle(next: boolean) {
    setSaving(true)
    const nowIso = next ? new Date().toISOString() : null
    const supabase = createClient()
    const { error } = await supabase
      .from('prospects')
      .update({
        funding_prequal_cleared: next,
        funding_prequal_cleared_at: nowIso,
        funding_prequal_cleared_by: next ? 'corporate' : null,
      })
      .eq('id', prospectId)
    if (!error) {
      setIsCleared(next)
      setAt(nowIso)
    }
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-500 font-medium flex items-center gap-2">
        <input
          type="checkbox"
          checked={isCleared}
          disabled={saving}
          onChange={(e) => handleToggle(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-[#4681A3] focus:ring-[#4681A3] disabled:opacity-50"
        />
        Funding pre-qual cleared
      </label>
      {isCleared && at && (
        <span className="text-xs text-gray-400">
          {new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      )}
      {saving && <span className="text-xs text-gray-400">Saving…</span>}
    </div>
  )
}
