'use server'

import { revalidatePath } from 'next/cache'
import { createProposalForProspect } from '@/lib/proposal/generate'
import { buildOutreachCopy, type OutreachCopy } from '@/lib/proposal/generate-copy'

export interface GenerateProposalResult {
  ok: boolean
  error?: string
  slug?: string
  /** One-time plaintext access code for the rep to send; only the hash is stored. */
  accessCode?: string
  url?: string
  regenerated?: boolean
  copy?: OutreachCopy
}

/**
 * Deal Room "Generate proposal" action (spec §11 / D3). Mints (or re-mints the
 * access code for) the prospect's gated /p/[slug] proposal and returns the link,
 * one-time access code, and ready-to-send draft copy. Outputs-only — no formula
 * mechanics cross this boundary (Hard Rule 1).
 */
export async function generateProposalAction(prospectId: string): Promise<GenerateProposalResult> {
  const outcome = await createProposalForProspect(prospectId)
  if (!outcome.ok || !outcome.slug || !outcome.accessCode || !outcome.url) {
    return { ok: false, error: outcome.error ?? 'generation failed' }
  }

  const copy: OutreachCopy = buildOutreachCopy({
    salutation: outcome.salutation ?? 'there',
    practiceName: outcome.practiceName ?? null,
    territoryName: outcome.territoryName ?? null,
    url: outcome.url,
    accessCode: outcome.accessCode,
  })

  revalidatePath(`/prospects/${prospectId}`)
  return {
    ok: true,
    slug: outcome.slug,
    accessCode: outcome.accessCode,
    url: outcome.url,
    regenerated: outcome.regenerated,
    copy,
  }
}
