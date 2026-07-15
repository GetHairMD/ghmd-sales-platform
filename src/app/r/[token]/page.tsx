import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'

// Prospect-facing tracked-link route (E-3, spec §4C.3). A prospect opens
// /r/<token> from a text or email — NO auth (that is the point; see isPublicPath
// in @/lib/auth-gate, which lists '/r/'). Always dynamic; the open is a live write.
export const dynamic = 'force-dynamic'

// Never indexed — same posture as the confidential proposal page (/p/[slug]).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * Validate the token, log exactly ONE link_opened event, stamp the share's
 * open-tracking columns, and redirect to the asset's external_url — all inside the
 * open_resource_share() SECURITY DEFINER function so it is atomic and the privileged
 * writes run as the definer (the prospect is unauthenticated, so there is no
 * auth.uid() to write as).
 *
 * The function returns ONLY the redirect URL (or NULL). This route therefore leaks
 * ZERO internal metadata — no rep name, no prospect name, no approval status, nothing
 * beyond the redirect itself (AC6). An unknown / inactive / target-less token yields
 * NULL → a graceful not-found with no stack trace or internal identifier (AC7).
 *
 * The redirect target is exec-authored (resource_assets.external_url is written only
 * under the executive-only INSERT/UPDATE policy), so this is not an open redirect from
 * untrusted input — the token only ever resolves to an approved, active asset's URL.
 */
export default async function ResourceRedirectPage({ params }: { params: { token: string } }) {
  const { token } = params

  const db = createServiceClient()
  const { data, error } = await db.rpc('open_resource_share', { p_token: token })

  // notFound() covers both the DB-error path and the null (unknown/inactive) path with
  // the site's ordinary 404 — indistinguishable, no leakage.
  if (error || typeof data !== 'string' || data.length === 0) {
    notFound()
  }

  // redirect() must be called outside any try/catch — it signals via a thrown control
  // flow. External absolute URL is supported.
  redirect(data)
}
