'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, CalendarDays, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Input from '@/components/ui/Input'
import { useDisplayName } from './useDisplayName'

/** Live date chip, e.g. "Sat, Jul 5". Resolved client-side (local timezone). */
function DateChip() {
  const [label, setLabel] = useState<string>('')
  useEffect(() => {
    setLabel(
      new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    )
  }, [])
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-mist px-3 py-1.5 text-xs font-medium text-text-muted sm:flex">
      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
      {label || ' '}
    </span>
  )
}

/**
 * Top bar (spec §4B): global search, live date chip, user chip + sign-out.
 * Search is presentational chrome this sprint (full cross-entity search is a
 * follow-up); the field is wired to prevent a dead-submit, not to query yet.
 */
export default function TopBar() {
  const router = useRouter()
  const { firstName, email } = useDisplayName()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initial = (firstName || email || '?').charAt(0).toUpperCase()

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-mist bg-bg/90 px-4 py-3 backdrop-blur sm:px-6">
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="w-full max-w-md"
      >
        <label htmlFor="global-search" className="sr-only">
          Search prospects and territories
        </label>
        <Input
          id="global-search"
          type="search"
          placeholder="Search prospects, territories…"
          leading={<Search className="h-4 w-4" aria-hidden="true" />}
        />
      </form>

      <div className="ml-auto flex items-center gap-3">
        <DateChip />

        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-text-inverse"
            aria-hidden="true"
          >
            {initial}
          </span>
          <span className="hidden text-sm font-medium text-text md:block">
            {firstName || email || 'Account'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-mist hover:text-text"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  )
}
