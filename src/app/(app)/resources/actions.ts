'use server'

import { randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { getViewerDesignation } from '@/lib/auth/internal-role'

export interface CreateShareResult {
  ok: boolean
  /** '/r/<token>' — the client composes the absolute URL with window.location.origin,
   *  so a tracked link always points at the host the rep is actually on (preview or prod). */
  path?: string
  error?: string
}

/**
 * Create a per-rep, per-prospect tracked share link for a Resource Library asset (E-3).
 *
 * Runs as the AUTHENTICATED rep (never the service role), so RLS is the hard boundary:
 * resource_shares_insert_rep_own decides whether the row lands (rep designation, active
 * asset, rep_id = auth.uid()). The designation branch below is defense-in-depth — a clean
 * error instead of an opaque RLS failure — NOT the thing that keeps a non-rep from sharing.
 *
 * rep_id is additionally SERVER-STAMPED from auth.uid() by the BEFORE INSERT trigger, so a
 * rep cannot forge another rep's rep_id even by calling PostgREST directly (AC5). We still
 * send rep_id = user.id so the policy's WITH CHECK passes explicitly.
 */
export async function createResourceShare(
  assetId: string,
  prospectId: string,
): Promise<CreateShareResult> {
  const designation = await getViewerDesignation()
  if (designation === null) {
    return { ok: false, error: 'You do not have access to Resources.' }
  }
  if (designation !== 'rep') {
    // Executives are graders, not sharers; the RLS INSERT policy would deny them anyway.
    return { ok: false, error: 'Only reps can generate tracked share links.' }
  }
  if (!assetId || !prospectId) {
    return { ok: false, error: 'Select a prospect before sharing.' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not authenticated' }

  // Unguessable token: 96 bits of crypto randomness (mirrors the randomBytes suffix used
  // for proposals.slug — a redirect token needs no human-readable stem). Retry once on the
  // astronomically unlikely unique-constraint collision; any other error is terminal.
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = randomBytes(12).toString('hex')
    const { error } = await supabase.from('resource_shares').insert({
      asset_id: assetId,
      rep_id: user.id,
      prospect_id: prospectId,
      token,
    })
    if (!error) return { ok: true, path: `/r/${token}` }
    if (error.code !== '23505') return { ok: false, error: error.message }
  }
  return { ok: false, error: 'Could not generate a unique link — please try again.' }
}
