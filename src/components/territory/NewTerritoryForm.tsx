'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Search } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import { cn } from '@/design/cn'
import { parseManualCenter, type GeocodeCandidate } from '@/lib/geocode'

/**
 * New Territory form (executive-only page). Collects a working name + a center location,
 * creates a draft territory via POST /api/territories, then hands off to /territories/[id]
 * where the existing V3SizingPanel drives size → poll → approve. It does NOT size here.
 *
 * Location resolves via server-side Mapbox geocoding (/api/geocode) with a manual lat/lng
 * fallback (Trace decision 2026-07-11) so a geocode miss never blocks creation.
 */
export default function NewTerritoryForm() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [addressQuery, setAddressQuery] = useState('')
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([])
  const [center, setCenter] = useState<{ lat: number; lng: number; label: string } | null>(null)

  const [manual, setManual] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')

  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch() {
    const q = addressQuery.trim()
    if (q.length < 3) {
      setError('Enter at least 3 characters to search.')
      return
    }
    setSearching(true)
    setError(null)
    setCandidates([])
    // Invalidate any prior selection (candidate or manual) when a new search begins, so a stale
    // center from a previous address can't be submitted against the newly-typed query.
    setCenter(null)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
      if (!res.ok) {
        setError('Address lookup failed. Enter coordinates manually below.')
        setManual(true)
        return
      }
      const { candidates: found } = (await res.json()) as { candidates: GeocodeCandidate[] }
      if (found.length === 0) {
        setError('No matches. Refine the address or enter coordinates manually.')
      }
      setCandidates(found)
    } catch {
      setError('Address lookup failed. Enter coordinates manually below.')
      setManual(true)
    } finally {
      setSearching(false)
    }
  }

  function pickCandidate(c: GeocodeCandidate) {
    setCenter({ lat: c.lat, lng: c.lng, label: c.label })
    setCandidates([])
    setAddressQuery(c.label)
  }

  function applyManual(latStr: string, lngStr: string) {
    const parsed = parseManualCenter(latStr, lngStr)
    // A blank field must not resolve to 0 — parseManualCenter returns null unless BOTH
    // coordinates are present, finite, and in range.
    setCenter(parsed ? { ...parsed, label: `Manual: ${parsed.lat}, ${parsed.lng}` } : null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('A territory name is required.')
      return
    }
    if (!center) {
      setError('Resolve a location first — search an address or enter coordinates.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/territories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), center_lat: center.lat, center_lng: center.lng }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to create territory.')
        setSubmitting(false)
        return
      }
      // Hand off to the existing detail page — a fresh draft renders V3SizingPanel mode="size".
      router.push(`/territories/${json.id}`)
    } catch {
      setError('Failed to create territory. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="territory-name" className="mb-1 block font-heading text-xs uppercase tracking-caps text-text-muted">
          Territory name
        </label>
        <Input
          id="territory-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Austin — Westlake"
          required
        />
        <p className="mt-1 text-xs text-text-muted">Internal working label — not shown to prospects.</p>
      </div>

      <div>
        <label htmlFor="territory-address" className="mb-1 block font-heading text-xs uppercase tracking-caps text-text-muted">
          Center location
        </label>
        <div className="flex gap-2">
          <Input
            id="territory-address"
            value={addressQuery}
            onChange={(e) => setAddressQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSearch()
              }
            }}
            placeholder="Search an address or place…"
            leading={<Search className="h-4 w-4" aria-hidden="true" />}
          />
          <Button type="button" variant="secondary" onClick={handleSearch} loading={searching}>
            Search
          </Button>
        </div>

        {candidates.length > 0 && (
          <Card padding="none" className="mt-2 overflow-hidden">
            <ul className="divide-y divide-mist">
              {candidates.map((c, i) => (
                <li key={`${c.lat},${c.lng},${i}`}>
                  <button
                    type="button"
                    onClick={() => pickCandidate(c)}
                    className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-bg-subtle"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 text-sm text-text">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <button
          type="button"
          onClick={() => setManual((v) => !v)}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          {manual ? 'Hide manual coordinates' : 'Enter coordinates manually'}
        </button>

        {manual && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="manual-lat" className="mb-1 block text-xs text-text-muted">Latitude</label>
              <Input
                id="manual-lat"
                inputMode="decimal"
                value={manualLat}
                onChange={(e) => {
                  setManualLat(e.target.value)
                  applyManual(e.target.value, manualLng)
                }}
                placeholder="30.2672"
              />
            </div>
            <div>
              <label htmlFor="manual-lng" className="mb-1 block text-xs text-text-muted">Longitude</label>
              <Input
                id="manual-lng"
                inputMode="decimal"
                value={manualLng}
                onChange={(e) => {
                  setManualLng(e.target.value)
                  applyManual(manualLat, e.target.value)
                }}
                placeholder="-97.7431"
              />
            </div>
          </div>
        )}

        {center && (
          <p className={cn('mt-2 flex items-center gap-1.5 text-sm text-success')}>
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Center set: {center.label}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={submitting} disabled={!name.trim() || !center}>
          Create &amp; size territory
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/territories')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
