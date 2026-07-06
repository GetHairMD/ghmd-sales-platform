/**
 * Shared service-role Supabase client (SERVER-ONLY).
 *
 * The proposal_* tables are RLS-enabled with no anon/authenticated policy
 * (service-role-only, decision #58 pattern). Internal rep-facing server code that
 * needs to read them — the dashboard (spec §8) and the prospect timeline (§11) —
 * uses this client. It is only ever imported from server components / route
 * handlers that are themselves auth-gated by src/middleware.ts; the browser never
 * touches it.
 *
 * Cached per module instance. Never expose the key or this client to the client
 * bundle (no 'use client' file may import it).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function createServiceClient(): SupabaseClient {
  if (cached) return cached
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  return cached
}
