import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildOverdueRequest, fetchOverdue } from '../../../scripts/second-opinion-gate/overdue-rpc'

// Allowlisted declaration lines — see credential-read-sites.test.ts branch (e).
const NEW_VAR = 'SUPABASE_SECRET_KEY'
const LEGACY_VAR = 'SUPABASE_SERVICE_ROLE_KEY'

/**
 * Second-Opinion Gate sweep — request shape (decision #199 remediation, D3 + D8).
 *
 * The sweep's PostgREST RPC call previously sent the credential on BOTH `apikey` and
 * `Authorization: Bearer`. Modern Supabase `sb_secret_` keys are not JWTs, so this asserts
 * the call is now key-FORMAT-AGNOSTIC: credential on `apikey` only, no Authorization header.
 *
 * ⚠ EVIDENTIARY SCOPE. This proves request CONSTRUCTION and resolver PRECEDENCE with mocked
 * env and an intercepted fetch. It does NOT — and pre-rotation cannot — prove that a real
 * `sb_secret_` key authenticates against hosted Supabase; that is provable only after Trace
 * provisions one, via the post-provision verification sequence. No live request is made here,
 * and no real or real-shaped credential appears anywhere in this file.
 */

const NEW_DUMMY = 'synthetic-not-a-real-key-QX7ZNEWMARKER-0000'
const LEGACY_DUMMY = 'synthetic-not-a-real-key-QX7ZLEGACYMARKER-0000'
const URL_BASE = 'https://example.invalid'

/**
 * Env is manipulated ONLY through `vi.stubEnv`, so this suite performs no `process.env[NAME]`
 * read of either credential and the framework owns save/restore.
 */
function setVar(name: string, value: string | undefined): void {
  vi.stubEnv(name, value)
}

/** Captures the single fetch the sweep makes, and answers it with an empty result set. */
function interceptFetch(): { calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  vi.stubGlobal('fetch', (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve('[]'),
    } as unknown as Response)
  })
  return { calls }
}

/** Flattens a request into one searchable string — url + every header name/value + body. */
function serialize(url: string, init: RequestInit | undefined): string {
  const headers = (init?.headers ?? {}) as Record<string, string>
  const headerText = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return [url, init?.method ?? '', headerText, String(init?.body ?? '')].join('\n')
}

function headerNames(init: RequestInit | undefined): string[] {
  return Object.keys((init?.headers ?? {}) as Record<string, string>).map((h) => h.toLowerCase())
}

beforeEach(() => {
  setVar('SUPABASE_URL', URL_BASE)
  setVar(NEW_VAR, NEW_DUMMY)
  setVar(LEGACY_VAR, LEGACY_DUMMY)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('overdue RPC request — apikey-only, resolver-preferred credential', () => {
  it('sends the request the sweep actually issues (POST to the residual_risk_overdue RPC)', async () => {
    const { calls } = interceptFetch()
    await fetchOverdue()

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${URL_BASE}/rest/v1/rpc/residual_risk_overdue`)
    expect(calls[0].init?.method).toBe('POST')
  })

  it('(a) carries the NEW-format value — the resolver preference reaches the wire', async () => {
    const { calls } = interceptFetch()
    await fetchOverdue()
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>
    expect(headers.apikey).toBe(NEW_DUMMY)
  })

  it('(b) carries the credential on the `apikey` header', async () => {
    const { calls } = interceptFetch()
    await fetchOverdue()
    expect(headerNames(calls[0].init)).toContain('apikey')
  })

  it('(c) sends NO Authorization header — the key-format-agnostic contract', async () => {
    const { calls } = interceptFetch()
    await fetchOverdue()
    expect(headerNames(calls[0].init)).not.toContain('authorization')
  })

  it('(d) the legacy value appears NOWHERE in the request when the new var is set', async () => {
    const { calls } = interceptFetch()
    await fetchOverdue()
    const whole = serialize(calls[0].url, calls[0].init)
    expect(whole).not.toContain(LEGACY_DUMMY)
    expect(whole).not.toContain('QX7ZLEGACYMARKER')
    expect(whole).toContain(NEW_DUMMY)
  })

  it('falls back to the legacy value only when the new var is absent — still apikey-only', async () => {
    setVar(NEW_VAR, undefined)
    const { calls } = interceptFetch()
    await fetchOverdue()

    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>
    expect(headers.apikey).toBe(LEGACY_DUMMY)
    expect(headerNames(calls[0].init)).not.toContain('authorization')
  })

  it('builds the same shape without performing any request at all', () => {
    const { calls } = interceptFetch()
    const { url, init } = buildOverdueRequest()

    expect(calls).toHaveLength(0)
    expect(url).toBe(`${URL_BASE}/rest/v1/rpc/residual_risk_overdue`)
    expect(headerNames(init)).toEqual(['apikey', 'content-type'])
  })

  it('throws (rather than sending an unauthenticated request) when no credential is configured', async () => {
    setVar(NEW_VAR, undefined)
    setVar(LEGACY_VAR, undefined)
    const { calls } = interceptFetch()

    await expect(fetchOverdue()).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})
