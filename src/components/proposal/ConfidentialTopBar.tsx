import { cn } from '@/design/cn'

interface ConfidentialTopBarProps {
  name: string | null
}

/**
 * Section 1 — thin confidential banner atop the proposal (dark).
 * All-caps tracked line personalising the page to the prospect.
 */
export default function ConfidentialTopBar({ name }: ConfidentialTopBarProps) {
  const who = name?.trim() || 'you'
  return (
    <div className={cn('w-full bg-black px-6 py-2 text-center')}>
      <p className="font-heading text-xs uppercase tracking-caps text-text-inverse/80">
        Prepared exclusively for {who}
      </p>
    </div>
  )
}
