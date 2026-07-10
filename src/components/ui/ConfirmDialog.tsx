'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/design/cn';
import Button, { type ButtonVariant } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What is incomplete (soft-gate dialogs state exactly what's missing — PRD §4.4). */
  description: ReactNode;
  /** What skipping will record (amber note). */
  records?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'soft' = amber soft-gate skip; 'danger' = destructive. */
  tone?: 'soft' | 'danger';
  /**
   * When true, this is a HARD block, not a confirm: render a single dismiss button
   * (no "advance anyway"), because there is nothing the operator can override to
   * proceed (scoping §7). `onCancel` is the dismiss handler; `onConfirm` is unused.
   */
  acknowledgeOnly?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Soft-gate confirm dialog (PRD §2.3, §4.4). Normally never blocks — it states what
 * is incomplete and what a skip records, then lets the operator proceed deliberately.
 * With `acknowledgeOnly`, it becomes a dismiss-only hard-block notice (no override).
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  records,
  confirmLabel = 'Advance anyway',
  cancelLabel = 'Cancel',
  tone = 'soft',
  acknowledgeOnly = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmVariant: ButtonVariant = tone === 'danger' ? 'danger' : 'primary';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-lg bg-bg p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle
            className={cn('mt-0.5 h-5 w-5 shrink-0', tone === 'danger' ? 'text-error' : 'text-warning')}
            aria-hidden="true"
          />
          <div className="flex-1">
            <h2 className="font-heading text-lg text-text">{title}</h2>
            <div className="mt-1 font-body text-sm text-text-muted">{description}</div>
            {records && (
              <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-2 font-body text-xs text-shadow">
                {records}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          {acknowledgeOnly ? (
            <Button ref={confirmRef} variant="primary" size="sm" onClick={onCancel}>
              {cancelLabel === 'Cancel' ? 'OK' : cancelLabel}
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button ref={confirmRef} variant={confirmVariant} size="sm" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
