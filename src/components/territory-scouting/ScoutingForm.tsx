'use client'

import { useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import { cn } from '@/design/cn'
import { parseManualCenter, type GeocodeCandidate } from '@/lib/geocode'

/**
 * Territory Scouting location input (executive-only page, decision #146). Reuses the New
 * Territory location UX almost verbatim — /api/geocode candidate picker + manual lat/lng
 * fallback via parseManualCenter — but points at POST /api/territory-scouting/reports and
 * stays on the page (scouting is deal-independent; nothing to hand off to /territories/[id]).
 *
 * On success it calls onCreated(reportId) so the parent can refresh the list and select the
 * new report; the form resets so another location can be scouted immediately.
 */
export default function ScoutingForm({ onCreated }: { onCreated: (reportId: string) => void }) {
  const [label, setLabel] = useState('')
  const [addressQuery, setAddressQuery] = useState('')
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([])
  const [center, setCenter] = useState<{ lat: number; lng: number; label: string } | null>(null)

  const [manual, setManual] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')

  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setLabel('')
    setAddressQuery('')
    setCandidates([])
    setCenter(null)
    setManual(false)
    setManualLat('')
    setManualLng('')
  }

  async function handleSearch() {
    const q = addressQuery.trim()
    if (q.length < 3) {
      setError('Enter at least 3 characters to search.')
      return
    }
    setSearching(true)
    setError(null)
    setCandidates([])
    // Invalidate any prior selection when a new search begins, so a stale center from a
    // previous address can't be submitted against the newly-typed query.
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
    if (!center) {
      setError('Resolve a location first — search an address or enter coordinates.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/territory-scouting/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          center: { lat: center.lat, lng: center.lng },
          label: label.trim() || undefined,
          location_label: center.label,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.reportId) {
        setError(json.error ?? 'Failed to run scouting report.')
        setSubmitting(false)
        return
      }
      resetForm()
      setSubmitting(false)
      onCreated(json.reportId as string)
    } catch {
      setError('Failed to run scouting report. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="scouting-label"
          className="mb-1 block font-heading text-xs uppercase tracking-caps text-text-muted"
        >
          Run label <span className="normal-case text-text-muted/70">(optional)</span>
        </label>
        <Input
          id="scouting-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Denver Metro — West"
        />
        <p className="mt-1 text-xs text-text-muted">A name to find this scouting run later.</p>
      </div>

      <div>
        <label
          htmlFor="scouting-address"
          className="mb-1 block font-heading text-xs uppercase tracking-caps text-text-muted"
        >
          Location to scout
        </label>
        <div className="flex gap-2">
          <Input
            id="scouting-address"
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
              <label htmlFor="scouting-manual-lat" className="mb-1 block text-xs text-text-muted">
                Latitude
              </label>
              <Input
                id="scouting-manual-lat"
                inputMode="decimal"
                value={manualLat}
                onChange={(e) => {
                  setManualLat(e.target.value)
                  applyManual(e.target.value, manualLng)
                }}
                placeholder="39.7392"
              />
            </div>
            <div>
              <label htmlFor="scouting-manual-lng" className="mb-1 block text-xs text-text-muted">
                Longitude
              </label>
              <Input
                id="scouting-manual-lng"
                inputMode="decimal"
                value={manualLng}
                onChange={(e) => {
                  setManualLng(e.target.value)
                  applyManual(manualLat, e.target.value)
                }}
                placeholder="-104.9903"
              />
            </div>
          </div>
        )}

        {center && (
          <p className={cn('mt-2 flex items-center gap-1.5 text-sm text-success')}>
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Location set: {center.label}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <Button type="submit" loading={submitting} disabled={!center}>
        Run scouting report
      </Button>
    </form>
  )
}
