import type { ReactNode } from 'react';
import { cn } from '@/design/cn';

// Capture Taxonomy v1 — every scored field carries value · source · confidence · notes.
export type FieldSource = 'transcript' | 'enrichment' | 'operator' | 'reviewer' | 'system';
export type FieldConfidence = 'high' | 'medium' | 'low';

export interface FourColumnFieldProps {
  label: string;
  value?: ReactNode;
  source?: FieldSource | null;
  confidence?: FieldConfidence | null;
  notes?: string | null;
  /** Awaiting extraction / Tier 2 — renders the placeholder state. */
  pending?: boolean;
}

const confidenceStyle: Record<FieldConfidence, string> = {
  high: 'text-success',
  medium: 'text-shadow',
  low: 'text-error font-semibold', // low confidence is a hard gate on triage
};

/**
 * Four-column field renderer (PRD §4.3): value · source · confidence · notes.
 * Low confidence is flagged red — it blocks triage generation until resolved.
 */
export default function FourColumnField({
  label,
  value,
  source,
  confidence,
  notes,
  pending = false,
}: FourColumnFieldProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(9rem,1fr)_1.4fr_auto] items-start gap-x-4 gap-y-1 border-b border-mist py-2 text-sm',
        confidence === 'low' && 'bg-error/5',
      )}
    >
      <span className="font-heading text-xs uppercase tracking-caps text-text-muted">{label}</span>
      {pending ? (
        <span className="italic text-text-muted">Awaiting Tier 2 review</span>
      ) : (
        <span className="text-text">{value ?? '—'}</span>
      )}
      <span className="text-right">
        {confidence ? (
          <span className={cn('font-heading text-[0.6875rem] uppercase tracking-caps', confidenceStyle[confidence])}>
            {confidence}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </span>
      {(source || notes) && (
        <p className="col-span-3 text-xs text-text-muted">
          {source && <span className="uppercase tracking-caps">{source}</span>}
          {source && notes && ' · '}
          {notes}
        </p>
      )}
    </div>
  );
}
