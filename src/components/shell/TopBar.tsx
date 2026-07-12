'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, CalendarDays, LogOut, Plus, Building2, UserPlus, MapPinned } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Input from '@/components/ui/Input'
import type { Designation } from '@/lib/auth/internal-role'
import { normalizeSearchTerm, ilikeContains } from '@/lib/global-search'
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
      {label || ' '}
    </span>
  )
}

type SearchHit =
  | { kind: 'prospect'; id: string; label: string; sub: string | null }
  | { kind: 'territory'; id: string; label: string }

const SEARCH_DEBOUNCE_MS = 250

/**
 * Top bar (spec §4B): global search, live date chip, quick-add, user chip + sign-out.
 *
 * Search queries prospects (full_name / practice_name) + territories (name) via ilike,
 * client-side under the signed-in role's existing RLS — reps see only their own prospects,
 * execs see all; territories are internal_users-wide. No RLS is widened here. The exec-only
 * "New Territory" quick-add option is gated on `designation` (threaded from the server
 * layout), so it never reaches a rep's markup.
 */
export default function TopBar({ designation }: { designation: Designation | null }) {
  const router = useRouter()
  const { firstName, email } = useDisplayName()

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const [addOpen, setAddOpen] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)

  const isExec = designation === 'executive'

  // Debounced typeahead. Runs three ilike queries (prospect name/practice, territory name)
  // in parallel and merges; each is RLS-scoped by the signed-in role.
  useEffect(() => {
    const term = normalizeSearchTerm(query)
    if (!term) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const handle = setTimeout(async () => {
      const supabase = createClient()
      const pattern = ilikeContains(term)
      const [byName, byPractice, byTerritory] = await Promise.all([
        supabase.from('prospects').select('id, full_name, practice_name').ilike('full_name', pattern).limit(5),
        supabase.from('prospects').select('id, full_name, practice_name').ilike('practice_name', pattern).limit(5),
        supabase.from('territories').select('id, name').ilike('name', pattern).limit(5),
      ])
      if (cancelled) return // a newer keystroke superseded this fetch; drop the stale result

      const prospectRows = [...(byName.data ?? []), ...(byPractice.data ?? [])]
      const seen = new Set<string>()
      const prospectHits: SearchHit[] = []
      for (const p of prospectRows) {
        if (seen.has(p.id)) continue
        seen.add(p.id)
        prospectHits.push({ kind: 'prospect', id: p.id, label: p.full_name, sub: p.practice_name })
      }
      const territoryHits: SearchHit[] = (byTerritory.data ?? []).map((t) => ({
        kind: 'territory',
        id: t.id,
        label: t.name,
      }))

      setHits([...prospectHits.slice(0, 5), ...territoryHits.slice(0, 5)])
      setSearching(false)
      setSearchOpen(true)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query])

  // Close the search results / quick-add menu on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function goTo(href: string) {
    setSearchOpen(false)
    setQuery('')
    setHits([])
    router.push(href)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initial = (firstName || email || '?').charAt(0).toUpperCase()

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-mist bg-bg/90 px-4 py-3 backdrop-blur sm:px-6">
      <div ref={searchRef} className="relative w-full max-w-md">
        <form role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="global-search" className="sr-only">
            Search prospects and territories
          </label>
          <Input
            id="global-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => hits.length > 0 && setSearchOpen(true)}
            placeholder="Search prospects, territories…"
            leading={<Search className="h-4 w-4" aria-hidden="true" />}
            autoComplete="off"
          />
        </form>

        {searchOpen && normalizeSearchTerm(query) && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-mist bg-bg shadow-lg">
            {hits.length === 0 ? (
              <p className="px-4 py-3 text-sm text-text-muted">
                {searching ? 'Searching…' : 'No matches.'}
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-mist overflow-y-auto">
                {hits.map((hit) => (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button
                      type="button"
                      onClick={() =>
                        goTo(hit.kind === 'prospect' ? `/prospects/${hit.id}` : `/territories/${hit.id}`)
                      }
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-bg-subtle"
                    >
                      {hit.kind === 'prospect' ? (
                        <Building2 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                      ) : (
                        <MapPinned className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-text">{hit.label}</span>
                        <span className="block text-xs text-text-muted">
                          {hit.kind === 'prospect' ? hit.sub || 'Prospect' : 'Territory'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <DateChip />

        <div ref={addRef} className="relative">
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={addOpen}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-heading text-xs font-medium uppercase tracking-caps text-text-inverse transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">New</span>
          </button>

          {addOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-md border border-mist bg-bg py-1 shadow-lg"
            >
              <Link
                href="/prospects/new"
                role="menuitem"
                onClick={() => setAddOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-text transition-colors hover:bg-bg-subtle"
              >
                <UserPlus className="h-4 w-4 text-text-muted" aria-hidden="true" />
                New Prospect
              </Link>
              {isExec && (
                <Link
                  href="/territories/new"
                  role="menuitem"
                  onClick={() => setAddOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-text transition-colors hover:bg-bg-subtle"
                >
                  <MapPinned className="h-4 w-4 text-text-muted" aria-hidden="true" />
                  New Territory
                </Link>
              )}
            </div>
          )}
        </div>

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
