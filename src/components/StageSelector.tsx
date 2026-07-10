'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PIPELINE_STAGES } from '@/lib/pipeline-stages'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { moveProspectStage } from '@/app/(app)/pipeline/actions'

interface PendingGate {
  targetStage: number
  gate: 'prequal'
  /** The confirmations already granted on the in-flight move. */
  confirmed: { prequal?: boolean }
}

/**
 * Deal Room stage control. Routes every stage change through the shared
 * `moveProspectStage` server action — the SAME path the Pipeline Board drag-drop
 * uses — so the hard qualification gate (advancing past Qualification Review requires a
 * cleared 'proceed' review) and the soft funding pre-qual gate (→ Contract Sent) are
 * both evaluated SERVER-SIDE (PRD hard constraint: frontend reads state, never computes
 * it). Confirmation and the hard-block notice reuse `ConfirmDialog` — the exact pattern
 * PipelineBoard uses; no second confirm surface.
 *
 * The server is authoritative on gate state. `fundingPrequalCleared`,
 * `skippedFundingPrequal`, and `skippedTriage` are retained on the props contract
 * (call-site stability + they reflect the record's server truth on load); the move
 * decision itself is made server-side, not from these props.
 */
export default function StageSelector({
  prospectId,
  currentStage,
}: {
  prospectId: string
  currentStage: number
  fundingPrequalCleared: boolean
  skippedFundingPrequal: boolean
  skippedTriage: boolean
}) {
  const router = useRouter()
  const [stage, setStage] = useState(currentStage)
  const [pending, setPending] = useState<PendingGate | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()

  function applyMove(targetStage: number, confirmed: PendingGate['confirmed']) {
    setSaving(true)
    startTransition(async () => {
      const res = await moveProspectStage(prospectId, targetStage, confirmed)
      if (res.blocked === 'qualification') {
        // Hard gate — NOT overridable. The controlled <select> stays on its prior
        // value; surface a dismiss-only notice, no "advance anyway".
        setBlocked(true)
        setSaving(false)
      } else if (res.requiresConfirm) {
        // A soft gate was crossed and not yet confirmed — surface the dialog.
        // The controlled <select> stays on its prior value until the move commits.
        setPending({ targetStage, gate: res.requiresConfirm, confirmed })
        setSaving(false)
      } else if (res.ok) {
        setStage(targetStage)
        setSaving(false)
        // Re-pull server truth so the header stage pill and any newly recorded
        // TRIAGE / PRE-QUAL SKIPPED badges reflect the move immediately.
        router.refresh()
      } else {
        // Move failed — leave the controlled select on its previous value.
        setSaving(false)
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-500 font-medium">Stage</label>
      <select
        value={stage}
        onChange={(e) => applyMove(parseInt(e.target.value, 10), {})}
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

      <ConfirmDialog
        open={pending !== null}
        title="Funding pre-qual not cleared"
        description="Contract Sent normally follows a cleared lender pre-qual. You can advance anyway."
        records="Advancing sets a PRE-QUAL SKIPPED flag on the record."
        confirmLabel="Advance anyway"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return
          const { targetStage } = pending
          const next = { ...pending.confirmed, [pending.gate]: true }
          setPending(null)
          applyMove(targetStage, next)
        }}
      />

      <ConfirmDialog
        open={blocked}
        acknowledgeOnly
        tone="danger"
        title="Qualification Review not cleared"
        description="This prospect can't advance past Qualification Review until an executive issues a “Proceed” recommendation on the qualification review."
        onCancel={() => setBlocked(false)}
        onConfirm={() => setBlocked(false)}
      />
    </div>
  )
}
