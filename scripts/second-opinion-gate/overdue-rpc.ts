/**
 * Second-Opinion Gate — the PostgREST call behind the overdue residual-risk sweep.
 *
 * Extracted from run-sweep.ts so the request SHAPE can be asserted deterministically with an
 * intercepted fetch (see src/lib/__tests__/credential-request-shape.test.ts). run-sweep.ts
 * executes main() at module scope, so importing it in a test would fire the whole sweep;
 * this module has no side effects on import.
 *
 * ⚠ SINGLE-HEADER CONTRACT (decision #199 remediation). The credential is sent on `apikey`
 * ONLY — no `Authorization: Bearer`. Supabase's modern `sb_secret_` keys are not JWTs, so a
 * Bearer header carrying one is not a well-formed bearer token. Sending the key on `apikey`
 * alone makes this request key-FORMAT-AGNOSTIC: it works identically for the legacy
 * service_role JWT and for a new-format secret key, which is what lets rotation be a pure
 * value swap. Do not re-add an Authorization header here.
 */
import { getSupabaseSecretKey, LEGACY_VAR, PREFERRED_VAR } from '../../src/lib/supabase/secret-key'

export interface OverdueRow {
  id: number
  title: string
  residual_risk_owner: string | null
  residual_risk_target_date: string | null
  decided_on: string | null
  days_overdue: number | null
  reason: 'overdue' | 'no_target_date'
}

export function env(name: string, fallback?: string): string {
  // ⚠ RUNTIME BACKSTOP. This is the repo's one generic, dynamically-named env reader, which makes
  // it the one place a credential could be fetched without the identifier ever appearing as text
  // — `env('SUPA' + 'BASE_SECRET_KEY')` would defeat the CI source scan entirely. Refusing the two
  // credential names here closes that path at runtime, where no amount of name construction helps.
  if (name === PREFERRED_VAR || name === LEGACY_VAR) {
    throw new Error(
      `${name} must not be read through the generic env() helper. ` +
        'Call getSupabaseSecretKey() from src/lib/supabase/secret-key.ts — it is the single read site.',
    )
  }
  const v = process.env[name]
  if (v == null || v === '') {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing required env var: ${name}`)
  }
  return v
}

/**
 * Builds the RPC request without performing it — the unit under test.
 * @throws via getSupabaseSecretKey() when no service credential is configured.
 */
export function buildOverdueRequest(): { url: string; init: RequestInit } {
  const base = env('SUPABASE_URL').replace(/\/+$/, '')
  return {
    url: `${base}/rest/v1/rpc/residual_risk_overdue`,
    init: {
      method: 'POST',
      headers: {
        apikey: getSupabaseSecretKey(),
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  }
}

export async function fetchOverdue(): Promise<OverdueRow[]> {
  // Direct POST to the PostgREST RPC endpoint rather than @supabase/supabase-js:
  // createClient() initializes a realtime client that throws on Node 20 without
  // a native WebSocket. residual_risk_overdue() is service-role only, so this
  // uses the service credential.
  const { url, init } = buildOverdueRequest()
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`residual_risk_overdue() failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as unknown
  return (Array.isArray(data) ? data : []) as OverdueRow[]
}
