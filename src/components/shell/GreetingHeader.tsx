'use client'
import { useEffect, useState } from 'react'
import { useDisplayName } from './useDisplayName'

/** Time-of-day salutation from an hour in [0,24). Pure for testability. */
export function greetingForHour(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

interface GreetingHeaderProps {
  /** Role-context line under the greeting (spec §4B). */
  subtitle?: string
}

/**
 * "Good {morning|afternoon|evening}, {first_name}" + role-context subtitle
 * (spec §4B). Greeting and name resolve on the client from the user's local
 * timezone — rendered empty on the server to avoid a hydration mismatch, then
 * filled after mount.
 */
export default function GreetingHeader({ subtitle }: GreetingHeaderProps) {
  const { firstName } = useDisplayName()
  const [timeOfDay, setTimeOfDay] = useState<'morning' | 'afternoon' | 'evening' | null>(null)

  useEffect(() => {
    setTimeOfDay(greetingForHour(new Date().getHours()))
  }, [])

  const greeting = timeOfDay
    ? `Good ${timeOfDay}${firstName ? `, ${firstName}` : ''}`
    : ' ' // non-breaking space holds layout height pre-hydration

  return (
    <header className="mb-6">
      <h1 className="font-heading text-2xl font-bold text-text sm:text-3xl">{greeting}</h1>
      {subtitle && <p className="mt-1 font-serif text-sm italic text-text-muted">{subtitle}</p>}
    </header>
  )
}
