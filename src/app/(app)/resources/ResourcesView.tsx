'use client'

import { useState } from 'react'
import { BookOpen, Copy, MessageSquare, Mail, Check } from 'lucide-react'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import type { Designation } from '@/lib/auth/internal-role'
import {
  RESOURCE_CATEGORY_ORDER,
  RESOURCE_CATEGORY_LABEL,
  RESOURCE_CATEGORY_DESCRIPTION,
  groupByCategory,
  type ResourceAsset,
  type ResourceCategory,
} from '@/lib/resources/resources'
import { createResourceShare } from './actions'

export interface ProspectOption {
  id: string
  full_name: string | null
  practice_name: string | null
}

/** Placeholder outreach copy — approved-copy convention (must clear claims review
 *  before any real send). The tracked link is appended by the share action. */
const SHARE_EMAIL_SUBJECT = 'A resource from GetHairMD'
function shareBody(url: string): string {
  return `Here's a resource I thought you'd find useful: ${url}`
}

function prospectLabel(p: ProspectOption): string {
  const name = p.full_name?.trim() || 'Unnamed prospect'
  return p.practice_name ? `${name} · ${p.practice_name}` : name
}

export default function ResourcesView({
  designation,
  assets,
  prospects,
}: {
  designation: Designation | null
  assets: ResourceAsset[]
  prospects: ProspectOption[]
}) {
  const grouped = groupByCategory(assets)
  const isRep = designation === 'rep'

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-text">Resources</h1>
        <p className="mt-1 text-sm text-text-muted">
          The Field Kit — approved, version-controlled collateral. Share any asset with a
          prospect as a tracked link; opens surface on your dashboard.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RESOURCE_CATEGORY_ORDER.map((category) => (
          <CategoryCard
            key={category}
            category={category}
            assets={grouped[category]}
            isRep={isRep}
            prospects={prospects}
          />
        ))}
      </div>
    </main>
  )
}

function CategoryCard({
  category,
  assets,
  isRep,
  prospects,
}: {
  category: ResourceCategory
  assets: ResourceAsset[]
  isRep: boolean
  prospects: ProspectOption[]
}) {
  return (
    <Card padding="none" className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-mist px-4 py-3">
        <span className="flex items-center gap-2 font-heading text-sm font-semibold text-text">
          <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          {RESOURCE_CATEGORY_LABEL[category]}
        </span>
        {assets.length > 0 && (
          <span className="shrink-0 rounded-full bg-mist px-2 py-0.5 font-heading text-[0.625rem] tabular-nums text-text-muted">
            {assets.length}
          </span>
        )}
      </div>

      {assets.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="Nothing here yet"
            description={RESOURCE_CATEGORY_DESCRIPTION[category]}
          />
        </div>
      ) : (
        <ul className="divide-y divide-mist">
          {assets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} isRep={isRep} prospects={prospects} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function AssetRow({
  asset,
  isRep,
  prospects,
}: {
  asset: ResourceAsset
  isRep: boolean
  prospects: ProspectOption[]
}) {
  return (
    <li className="px-4 py-3">
      <p className="text-sm font-semibold text-text">{asset.title}</p>
      {asset.description && (
        <p className="mt-0.5 text-xs text-text-muted">{asset.description}</p>
      )}
      {asset.version && (
        <p className="mt-0.5 text-[0.6875rem] text-text-muted">Version {asset.version}</p>
      )}
      {isRep && <ShareControls asset={asset} prospects={prospects} />}
    </li>
  )
}

type ShareAction = 'copy' | 'text' | 'email'

function ShareControls({
  asset,
  prospects,
}: {
  asset: ResourceAsset
  prospects: ProspectOption[]
}) {
  const [prospectId, setProspectId] = useState('')
  // Cache the generated link per selected prospect so the three actions reuse one share
  // row instead of minting a new tracked link on every button press.
  const [cachedUrl, setCachedUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState<ShareAction | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (prospects.length === 0) {
    return (
      <p className="mt-2 text-xs text-text-muted">
        Assign a prospect to yourself to share this.
      </p>
    )
  }

  async function ensureUrl(): Promise<string | null> {
    if (cachedUrl) return cachedUrl
    const result = await createResourceShare(asset.id, prospectId)
    if (!result.ok || !result.path) {
      setError(result.error ?? 'Could not create the link.')
      return null
    }
    const url = `${window.location.origin}${result.path}`
    setCachedUrl(url)
    return url
  }

  async function handle(action: ShareAction) {
    if (!prospectId) {
      setError('Select a prospect first.')
      return
    }
    setError(null)
    setBusy(action)
    try {
      const url = await ensureUrl()
      if (!url) return
      if (action === 'copy') {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      } else if (action === 'text') {
        window.location.href = `sms:?&body=${encodeURIComponent(shareBody(url))}`
      } else {
        window.location.href = `mailto:?subject=${encodeURIComponent(
          SHARE_EMAIL_SUBJECT,
        )}&body=${encodeURIComponent(shareBody(url))}`
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-2">
      <label className="sr-only" htmlFor={`share-prospect-${asset.id}`}>
        Choose a prospect to share {asset.title}
      </label>
      <select
        id={`share-prospect-${asset.id}`}
        value={prospectId}
        onChange={(e) => {
          setProspectId(e.target.value)
          setCachedUrl(null) // new prospect → new tracked link
          setError(null)
        }}
        className="w-full rounded-md border border-mist bg-bg px-2 py-1.5 text-xs text-text"
      >
        <option value="">Select a prospect…</option>
        {prospects.map((p) => (
          <option key={p.id} value={p.id}>
            {prospectLabel(p)}
          </option>
        ))}
      </select>

      <div className="mt-2 flex flex-wrap gap-2">
        <ShareButton
          onClick={() => handle('copy')}
          disabled={!prospectId || busy !== null}
          icon={copied ? Check : Copy}
          label={copied ? 'Copied' : 'Copy Link'}
        />
        <ShareButton
          onClick={() => handle('text')}
          disabled={!prospectId || busy !== null}
          icon={MessageSquare}
          label="Text"
        />
        <ShareButton
          onClick={() => handle('email')}
          disabled={!prospectId || busy !== null}
          icon={Mail}
          label="Email"
        />
      </div>

      {error && <p className="mt-1.5 text-xs text-error">{error}</p>}
    </div>
  )
}

function ShareButton({
  onClick,
  disabled,
  icon: Icon,
  label,
}: {
  onClick: () => void
  disabled: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-mist bg-bg px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
