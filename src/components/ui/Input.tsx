import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/design/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Optional leading adornment (e.g. a search icon), rendered inside the field. */
  leading?: ReactNode
  /** Error state — red ring + border (token `error`), for form validation. */
  invalid?: boolean
}

/**
 * Text input (spec §11 / PRD §4.3). Token-styled: mist border, ocean focus ring.
 * Pairs a `<label>` externally; keep the `id`/`htmlFor` relationship in the caller.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leading, invalid = false, className, ...props },
  ref,
) {
  return (
    <span className="relative flex items-center">
      {leading && (
        <span
          className="pointer-events-none absolute left-3 flex text-text-muted"
          aria-hidden="true"
        >
          {leading}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          'w-full rounded-md border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted',
          'transition-colors duration-base ease-standard',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          leading ? 'pl-9' : null,
          invalid
            ? 'border-error focus:ring-error'
            : 'border-mist focus:border-primary focus:ring-primary',
          className,
        )}
        {...props}
      />
    </span>
  )
})

export default Input
