import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/design/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables interaction. */
  loading?: boolean;
  /** Stretch to container width. */
  block?: boolean;
}

// All-caps DM Sans per §4.2 (headings + all-caps labels/buttons).
const base =
  'inline-flex items-center justify-center gap-2 font-heading uppercase tracking-caps ' +
  'rounded-md font-medium select-none transition-colors duration-base ease-standard ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-text-inverse hover:bg-primary/90 active:bg-primary/80',
  secondary: 'bg-secondary text-text hover:bg-secondary/80 active:bg-secondary/70',
  ghost: 'bg-transparent text-primary hover:bg-mist active:bg-mist/70',
  danger: 'bg-error text-text-inverse hover:bg-error/90 active:bg-error/80',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-base px-5 py-2.5',
};

const Spinner = () => (
  <svg
    className="animate-spin h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
);

/**
 * Primary interactive control (PRD §4.3). Variants: primary/secondary/ghost/danger.
 * States covered: default, hover, active, focus-visible, disabled, loading.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, block = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

export default Button;
