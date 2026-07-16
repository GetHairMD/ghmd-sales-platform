'use client'

import { useState, useTransition } from 'react'
import { BadgeDollarSign } from 'lucide-react'
import { cn } from '@/design/cn'
import { TERRITORY_STANDARD_PRICE } from '@/components/proposal/constants'
import {
  DISCOUNT_REASONS,
  DISCOUNT_REASON_LABELS,
  type DiscountReason,
} from '@/lib/rep-command-center/metrics'
import { setTerritoryPrice } from './price-actions'

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/**
 * Executive-only territory-price / discount entry (§4D). Rendered ONLY inside the
 * page's `isExecutive` branch — a rep session never receives this node (same
 * injection pattern as qualificationExecDetail). The server action re-checks the
 * executive gate regardless, so this is UX, not the security boundary.
 *
 * A below-list price requires a discount reason (enforced here AND in the action AND
 * by the DB trigger/CHECK). At or above list, the reason selector is hidden and any
 * prior discount is cleared on save.
 */
export default function TerritoryPriceControl({
  prospectId,
  currentPrice,
  currentReason,
}: {
  prospectId: string
  currentPrice: number | null
  currentReason: DiscountReason | null
}) {
  const [price, setPrice] = useState<string>(currentPrice != null ? String(currentPrice) : '')
  const [reason, setReason] = useState<DiscountReason | ''>(currentReason ?? '')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const parsed = Number(price)
  const priceValid = Number.isFinite(parsed) && parsed > 0
  const belowList = priceValid && parsed < TERRITORY_STANDARD_PRICE
  const reasonMissing = belowList && !reason
  const canSubmit = priceValid && !reasonMissing && !pending

  function handleSave() {
    setMessage(null)
    startTransition(async () => {
      const result = await setTerritoryPrice(prospectId, parsed, belowList ? reason || null : null)
      setMessage(
        result.ok
          ? { tone: 'ok', text: 'Territory price saved.' }
          : { tone: 'error', text: result.error ?? 'Could not save the price.' },
      )
    })
  }

  return (
    <div className="rounded-lg border border-mist bg-bg p-4">
      <div className="flex items-center gap-2">
        <BadgeDollarSign className="h-4 w-4 text-text-muted" aria-hidden="true" />
        <p className="font-heading text-xs uppercase tracking-caps text-text-muted">
          Territory price <span className="text-text-muted/70">· executive only</span>
        </p>
      </div>

      <p className="mt-2 text-sm text-text">
        Recorded:{' '}
        <span className="font-medium">
          {currentPrice != null ? usd.format(currentPrice) : 'none yet'}
        </span>
        {currentReason && (
          <span className="text-text-muted"> · {DISCOUNT_REASON_LABELS[currentReason]}</span>
        )}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        Standard price is {usd.format(TERRITORY_STANDARD_PRICE)}. A lower price requires a discount
        reason and is recorded as authorized by you.
      </p>

      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-text-muted">Territory price (USD)</span>
          <input
            type="number"
            min={0}
            step={1000}
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded-md border border-mist bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          />
        </label>

        {belowList && (
          <label className="block">
            <span className="text-xs font-medium text-text-muted">
              Discount reason <span className="text-error">*</span>
            </span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as DiscountReason | '')}
              disabled={pending}
              className="mt-1 w-full rounded-md border border-mist bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              <option value="">Select a reason…</option>
              {DISCOUNT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {DISCOUNT_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSubmit}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              canSubmit
                ? 'bg-primary text-text-inverse hover:bg-primary/90'
                : 'cursor-not-allowed bg-mist text-text-muted',
            )}
          >
            {pending ? 'Saving…' : 'Save price'}
          </button>
          {reasonMissing && (
            <span className="text-xs text-text-muted">A discount reason is required below list.</span>
          )}
          {message && (
            <span className={cn('text-xs', message.tone === 'ok' ? 'text-success' : 'text-error')}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
