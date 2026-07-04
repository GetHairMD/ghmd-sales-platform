import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/design/cn';

export type ToastVariant = 'success' | 'warning' | 'error' | 'info';

interface ToastProps {
  variant?: ToastVariant;
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

const config: Record<ToastVariant, { icon: ComponentType<{ className?: string }>; accent: string }> = {
  success: { icon: CheckCircle2, accent: 'text-success' },
  warning: { icon: AlertTriangle, accent: 'text-warning' },
  error: { icon: XCircle, accent: 'text-error' },
  info: { icon: Info, accent: 'text-info' },
};

/** Inline toast / notification (PRD §4.3). Presentational — queueing is app-level. */
export default function Toast({ variant = 'info', title, message, onDismiss, className }: ToastProps) {
  const { icon: Icon, accent } = config[variant];
  return (
    <div
      role="status"
      className={cn(
        'flex w-full max-w-sm items-start gap-3 rounded-lg border border-mist bg-bg p-3 shadow-md',
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', accent)} aria-hidden="true" />
      <div className="flex-1 font-body text-sm">
        {title && <p className="font-heading text-xs uppercase tracking-caps text-text">{title}</p>}
        <p className="text-text-muted">{message}</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="rounded p-0.5 text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
