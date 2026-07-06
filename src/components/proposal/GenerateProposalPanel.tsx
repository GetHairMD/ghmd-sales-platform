'use client'

import { useState, useTransition } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { cn } from '@/design/cn'
import {
  generateProposalAction,
  type GenerateProposalResult,
} from '@/app/prospects/[id]/proposal-actions'

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* clipboard unavailable — no-op */
        }
      }}
      className="inline-flex items-center gap-1 font-heading text-[0.625rem] uppercase tracking-caps text-primary hover:underline"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-mist bg-bg-subtle p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-heading text-[0.625rem] uppercase tracking-caps text-text-muted">{label}</span>
        <CopyButton value={value} label={label} />
      </div>
      <p className={cn('whitespace-pre-wrap break-words text-sm text-text', mono && 'font-mono')}>{value}</p>
    </div>
  )
}

export default function GenerateProposalPanel({ prospectId }: { prospectId: string }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<GenerateProposalResult | null>(null)

  function run() {
    startTransition(async () => {
      setResult(await generateProposalAction(prospectId))
    })
  }

  return (
    <div className="rounded-lg border border-mist bg-bg p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-heading text-xs uppercase tracking-caps text-text-muted">Proposal</p>
          <p className="mt-0.5 text-sm text-text-muted">
            Mint a gated proposal link + access code from this record.
          </p>
        </div>
        <Button size="sm" onClick={run} disabled={pending}>
          {pending ? 'Generating…' : result?.ok ? 'Regenerate' : 'Generate proposal'}
        </Button>
      </div>

      {result && !result.ok && (
        <p className="mt-3 text-sm text-error">Could not generate: {result.error}</p>
      )}

      {result?.ok && result.copy && result.url && result.accessCode && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 font-heading text-[0.625rem] uppercase tracking-caps text-black">
              {result.regenerated ? 'Access code re-minted' : 'Proposal created'}
            </span>
            <Link
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Proposal link" value={result.url} />
            <Field label="Access code" value={result.accessCode} mono />
          </div>

          {/* Placeholder-approved copy — must clear Trace/claims review before real send. */}
          <p className="rounded-md border border-dashed border-mist bg-bg-subtle px-2.5 py-1.5 text-[0.6875rem] text-text-muted">
            Draft copy — template placeholder, needs approval before sending.
          </p>
          <Field label="Email subject" value={result.copy.emailSubject} />
          <Field label="Email body" value={result.copy.emailBody} />
          <Field label="SMS" value={result.copy.sms} />
        </div>
      )}
    </div>
  )
}
