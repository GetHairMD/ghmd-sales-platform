'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/design/cn';

// Fit is Proceed / Conditional / Pass — NEVER a composite number (PRD §4.5, #2).
export type TriageFit = 'proceed' | 'conditional' | 'pass';

interface TriageChipProps {
  /** null renders the "—" placeholder (no triage yet / hard gate unmet). */
  fit: TriageFit | null;
  /** Optional evidence — when present the chip is a button that reveals a popover. */
  evidence?: ReactNode;
  className?: string;
}

const styles: Record<TriageFit, string> = {
  proceed: 'bg-success/10 text-success border-success/30',
  conditional: 'bg-warning/15 text-shadow border-warning/40',
  pass: 'bg-error/10 text-error border-error/30',
};

const label: Record<TriageFit, string> = {
  proceed: 'Proceed',
  conditional: 'Conditional',
  pass: 'Pass',
};

const chipClass = (fit: TriageFit | null) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1',
    'font-heading text-xs uppercase tracking-caps',
    fit ? styles[fit] : 'border-mist bg-mist text-text-muted',
  );

/** Triage / Fit chip with optional evidence popover (PRD §3.2, §4.3). */
export default function TriageChip({ fit, evidence, className }: TriageChipProps) {
  const [open, setOpen] = useState(false);
  const text = fit ? label[fit] : '—';

  if (!evidence) {
    return <span className={cn(chipClass(fit), className)}>{text}</span>;
  }

  return (
    <span className={cn('relative inline-block', className)}>
      <button
        type="button"
        className={cn(chipClass(fit), 'cursor-pointer')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        {text}
      </button>
      {open && (
        <div
          role="dialog"
          className={cn(
            'absolute left-0 top-full z-10 mt-2 w-64 rounded-lg bg-bg p-3 shadow-lg',
            'border border-mist font-body text-sm text-text',
          )}
        >
          {evidence}
        </div>
      )}
    </span>
  );
}
