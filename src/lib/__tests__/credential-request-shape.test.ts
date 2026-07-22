import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

/** Round 9: unique marker for anything a failing response could reflect back at us. */
const FAIL_MARKER = 'QX7ZBODYLEAKMARKER'
const FAIL_BODY = `{"hint":"synthetic-reflected-value-${FAIL_MARKER}-0000"}`

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

/**
 * Answers the sweep with a NON-OK response whose body, statusText, headers and url all carry
 * synthetic sentinels, and records whether `text()` / `json()` were ever consumed.
 */
function interceptFailingFetch(status: number, bodySentinel: string) {
  const consumed = { text: 0, json: 0 }
  vi.stubGlobal('fetch', () =>
    Promise.resolve({
      ok: false,
      status,
      statusText: `STATUSTEXT-${FAIL_MARKER}`,
      url: `https://example.invalid/?leak=${FAIL_MARKER}`,
      headers: { get: () => `HEADER-${FAIL_MARKER}` },
      text: () => {
        consumed.text += 1
        return Promise.resolve(bodySentinel)
      },
      json: () => {
        consumed.json += 1
        return Promise.resolve({ leaked: bodySentinel })
      },
    } as unknown as Response),
  )
  return consumed
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

  it('does NOT fall back to the retired var — throws and sends nothing when only it is set', async () => {
    // Reintroduction regression: the legacy fallback was removed. With the modern var absent and
    // only the retired var set, the resolver throws, so no request is issued.
    setVar(NEW_VAR, undefined)
    const { calls } = interceptFetch()
    await expect(fetchOverdue()).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('builds the same shape without performing any request at all', () => {
    const { calls } = interceptFetch()
    const { url, init } = buildOverdueRequest()

    expect(calls).toHaveLength(0)
    expect(url).toBe(`${URL_BASE}/rest/v1/rpc/residual_risk_overdue`)
    expect(headerNames(init)).toEqual(['apikey', 'content-type'])
  })

  it('a failing response produces a STATUS-ONLY error — no body, and text() is never called', async () => {
    // Round 9. This request carries the service credential, so the endpoint's error body is
    // untrusted with respect to credential material; the sweep's top-level handler console.errors
    // whatever is thrown, straight into the Actions log.
    const logs: string[] = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '))
      })
    }
    const consumed = interceptFailingFetch(503, FAIL_BODY)

    let thrown = ''
    try {
      await fetchOverdue()
    } catch (err) {
      thrown = `${(err as Error).message}\n${(err as Error).stack ?? ''}`
    }

    // (1) status-only exception
    expect(thrown).not.toBe('')
    expect(thrown).toContain('503')
    expect(thrown).toContain('residual_risk_overdue')

    // (2) neither the sentinel nor its unique substring reaches the message or any log
    const haystack = `${thrown}\n${logs.join('\n')}`
    for (const secret of [FAIL_BODY, FAIL_MARKER]) {
      expect(haystack).not.toContain(secret)
    }
    // Nor any other server-controlled field (statusText / headers / url all carried the marker).
    expect(haystack).not.toContain('STATUSTEXT-')
    expect(haystack).not.toContain('HEADER-')

    // (3) the body was never even read — withheld, not redacted
    expect(consumed.text).toBe(0)
    expect(consumed.json).toBe(0)
  })

  it('withholds the body for every non-OK status, not just one', async () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      const consumed = interceptFailingFetch(status, FAIL_BODY)
      await expect(fetchOverdue()).rejects.toThrow(new RegExp(`HTTP ${status}`))
      expect(consumed.text).toBe(0)
      vi.unstubAllGlobals()
    }
  })

  it('(4) successful-response behaviour is unchanged', async () => {
    const { calls } = interceptFetch()
    await expect(fetchOverdue()).resolves.toEqual([])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${URL_BASE}/rest/v1/rpc/residual_risk_overdue`)
  })

  it('throws (rather than sending an unauthenticated request) when no credential is configured', async () => {
    setVar(NEW_VAR, undefined)
    setVar(LEGACY_VAR, undefined)
    const { calls } = interceptFetch()

    await expect(fetchOverdue()).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})

describe('sweep error paths never put a response body into a CI-visible error (round 9)', () => {
  /**
   * (5) Narrow source assertion over the KNOWN Second-Opinion Gate sweep paths, so a response
   * body cannot be reintroduced into a thrown error later. Deliberately scoped to these two
   * files — this is not a repository-wide error-handling rule.
   */
  const SWEEP_SOURCES = [
    'scripts/second-opinion-gate/overdue-rpc.ts',
    'scripts/second-opinion-gate/run-sweep.ts',
  ]
  const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  for (const file of SWEEP_SOURCES) {
    it(`${file} consumes no response body on a failure path`, () => {
      const src = codeOnly(readFileSync(join(process.cwd(), file), 'utf8'))
      // No body consumption at all in these files (the success path uses res.json() only in
      // overdue-rpc, which is asserted separately below).
      expect(/res\.text\(\)/.test(src), 'response body must never be read for an error').toBe(false)
      // No server-controlled field interpolated into an error either.
      expect(/statusText/.test(src)).toBe(false)
      expect(/throw new Error\([^)]*res\.url/.test(src)).toBe(false)
      expect(/throw new Error\([^)]*res\.headers/.test(src)).toBe(false)
    })

    it(`${file} throws status-only errors`, () => {
      const src = codeOnly(readFileSync(join(process.cwd(), file), 'utf8'))
      const throwsOnNotOk = src.match(/if \(!res\.ok\)[\s\S]{0,160}?throw new Error\(`[^`]*`/g) ?? []
      expect(throwsOnNotOk.length).toBeGreaterThan(0)
      for (const stmt of throwsOnNotOk) {
        // Exactly one interpolation, and it is the numeric status.
        const interpolations = stmt.match(/\$\{[^}]*\}/g) ?? []
        expect(interpolations, stmt).toEqual(['${res.status}'])
      }
    })
  }

  it('the success path still parses the body (the fix withholds only on failure)', () => {
    const src = codeOnly(readFileSync(join(process.cwd(), 'scripts/second-opinion-gate/overdue-rpc.ts'), 'utf8'))
    expect(src.includes('await res.json()')).toBe(true)
  })
})
