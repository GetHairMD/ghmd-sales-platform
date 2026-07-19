/**
 * Tests for the sizing Background Function's shared-secret auth (PR-0a.1, #181)
 * and the runtime serve-refusal (#182).
 *
 * The threat this closes: `/.netlify/functions/size-territory-background` is
 * publicly invocable and the app middleware cannot reach it (the matcher's
 * `.netlify` exclusion is load-bearing P0 history). Before this change, anyone
 * with a valid job UUID could drive billable Census/Mapbox compute through a
 * SERVICE-ROLE client and overwrite the job row.
 *
 * ⚠ No real secret value appears anywhere in this file. The fixtures below are
 * obviously-fake literals used only to exercise comparison logic.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SIZING_SECRET_ENV,
  SIZING_SECRET_HEADER,
  authorizeSizingRequest,
  isSizingSecretConfigured,
  verifySizingSecret,
} from '../sizing-function-auth'
import { isHostedRuntime, shouldRefuseDeployment, shouldRefuseServing } from '../deployment-guard.mjs'

// Obviously-fake test fixtures. Not secrets.
const FAKE_SECRET = 'test-only-fake-secret-value'
const FAKE_WRONG = 'test-only-wrong-secret-value'

describe('isSizingSecretConfigured', () => {
  it('is true when provisioned', () => {
    expect(isSizingSecretConfigured({ [SIZING_SECRET_ENV]: FAKE_SECRET })).toBe(true)
  })

  it('is false when absent — fails closed, never degrades to "no auth required"', () => {
    expect(isSizingSecretConfigured({})).toBe(false)
  })

  it('is false when empty — a blank secret is not a secret', () => {
    expect(isSizingSecretConfigured({ [SIZING_SECRET_ENV]: '' })).toBe(false)
  })
})

describe('verifySizingSecret — constant-time comparison', () => {
  it('accepts an exact match', () => {
    expect(verifySizingSecret(FAKE_SECRET, FAKE_SECRET)).toBe(true)
  })

  it('rejects a wrong value of the same length', () => {
    expect(verifySizingSecret(FAKE_WRONG, FAKE_SECRET)).toBe(false)
  })

  // The reason both sides are SHA-256 digested before timingSafeEqual: the naive
  // implementation needs an early length-mismatch return, and that return is a
  // timing oracle leaking the secret's length. Digesting makes both operands
  // unconditionally 32 bytes, so this path cannot throw and cannot leak length.
  it.each([
    ['much shorter', 'x'],
    ['much longer', 'x'.repeat(4096)],
    ['empty', ''],
    ['one char short', FAKE_SECRET.slice(0, -1)],
    ['one char long', `${FAKE_SECRET}x`],
  ])('does not throw and returns false on a %s input', (_label, presented) => {
    expect(() => verifySizingSecret(presented, FAKE_SECRET)).not.toThrow()
    expect(verifySizingSecret(presented, FAKE_SECRET)).toBe(false)
  })

  it.each([null, undefined, ''])('rejects missing presented value: %j', (presented) => {
    expect(verifySizingSecret(presented, FAKE_SECRET)).toBe(false)
  })

  it.each([null, undefined, ''])('rejects missing expected value: %j', (expected) => {
    expect(verifySizingSecret(FAKE_SECRET, expected)).toBe(false)
  })

  it('is case-sensitive and whitespace-sensitive — no normalization', () => {
    expect(verifySizingSecret(FAKE_SECRET.toUpperCase(), FAKE_SECRET)).toBe(false)
    expect(verifySizingSecret(` ${FAKE_SECRET}`, FAKE_SECRET)).toBe(false)
    expect(verifySizingSecret(`${FAKE_SECRET}\n`, FAKE_SECRET)).toBe(false)
  })
})

describe('authorizeSizingRequest', () => {
  const provisioned = { [SIZING_SECRET_ENV]: FAKE_SECRET }

  it('authorizes a correct header', () => {
    expect(authorizeSizingRequest(FAKE_SECRET, provisioned)).toEqual({ ok: true })
  })

  it('503s when unprovisioned — even if the caller presents something', () => {
    expect(authorizeSizingRequest(FAKE_SECRET, {})).toEqual({
      ok: false,
      status: 503,
      reason: 'sizing_secret_not_provisioned',
    })
  })

  it('401s on an absent header', () => {
    expect(authorizeSizingRequest(null, provisioned)).toEqual({
      ok: false,
      status: 401,
      reason: 'unauthorized',
    })
  })

  it('401s on a wrong header', () => {
    expect(authorizeSizingRequest(FAKE_WRONG, provisioned)).toEqual({
      ok: false,
      status: 401,
      reason: 'unauthorized',
    })
  })

  it('401s on an oversize header without throwing', () => {
    expect(() => authorizeSizingRequest('A'.repeat(100_000), provisioned)).not.toThrow()
    expect(authorizeSizingRequest('A'.repeat(100_000), provisioned).ok).toBe(false)
  })

  // Unprovisioned takes precedence: we must never reach the comparison with an
  // absent expected value, and must never answer 401 (which would imply "present
  // the right secret and you're in") when there is no secret at all.
  it('prefers 503 over 401 when unprovisioned', () => {
    expect(authorizeSizingRequest('anything', { [SIZING_SECRET_ENV]: '' }).status).toBe(503)
  })

  it('never leaks the expected value in its outcome', () => {
    const outcome = JSON.stringify(authorizeSizingRequest(FAKE_WRONG, provisioned))
    expect(outcome).not.toContain(FAKE_SECRET)
  })
})

/**
 * Ordering is the security property that matters most here: an unauthorized
 * request must touch nothing. These assert the handler refuses BEFORE building a
 * service-role client, reading the job row, or making any external call.
 */
describe('background function handler — auth precedes all work', () => {
  const createServiceClient = vi.fn()
  const runSizingJob = vi.fn()

  vi.mock('../supabase/service', () => ({ createServiceClient: () => createServiceClient() }))

  beforeEach(() => {
    createServiceClient.mockReset()
    runSizingJob.mockReset()
    vi.unstubAllEnvs()
  })

  async function loadHandler() {
    vi.doMock('../../../netlify/../src/lib/supabase/service', () => ({
      createServiceClient: createServiceClient,
    }))
    vi.doMock('../territory-sizing-jobs', () => ({
      runSizingJob: runSizingJob,
      SIZING_BACKGROUND_FUNCTION: 'size-territory-background',
    }))
    const mod = await import('../../../netlify/functions/size-territory-background.mts')
    return mod.default
  }

  function req(headers: Record<string, string> = {}, body: unknown = { jobId: 'job-123' }) {
    return new Request('https://example.test/.netlify/functions/size-territory-background', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  }

  it('401s with no header, and never constructs a service client or runs the job', async () => {
    vi.stubEnv(SIZING_SECRET_ENV, FAKE_SECRET)
    const handler = await loadHandler()
    const res = await handler(req())
    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(runSizingJob).not.toHaveBeenCalled()
  })

  it('401s with a wrong header, and touches nothing', async () => {
    vi.stubEnv(SIZING_SECRET_ENV, FAKE_SECRET)
    const handler = await loadHandler()
    const res = await handler(req({ [SIZING_SECRET_HEADER]: FAKE_WRONG }))
    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(runSizingJob).not.toHaveBeenCalled()
  })

  it('503s when the secret is unprovisioned, and touches nothing', async () => {
    vi.stubEnv(SIZING_SECRET_ENV, '')
    const handler = await loadHandler()
    const res = await handler(req({ [SIZING_SECRET_HEADER]: FAKE_SECRET }))
    expect(res.status).toBe(503)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(runSizingJob).not.toHaveBeenCalled()
  })

  it('refuses before parsing the body — a malformed body still 401s, not 400', async () => {
    vi.stubEnv(SIZING_SECRET_ENV, FAKE_SECRET)
    const handler = await loadHandler()
    const bad = new Request('https://example.test/.netlify/functions/size-territory-background', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{{',
    })
    const res = await handler(bad)
    // 401 (auth first), NOT 400 (body parse first) — proves the ordering.
    expect(res.status).toBe(401)
  })

  // POSITIVE CONTROL — load-bearing. Without this, every "not.toHaveBeenCalled()"
  // above could be passing trivially because the mocks never took effect. This
  // proves the spies are actually wired to the handler's dependencies: with a
  // correct secret the job MUST run. If this fails, the negative assertions are
  // worthless and must not be trusted.
  it('proceeds and runs the job when the secret is correct', async () => {
    vi.stubEnv(SIZING_SECRET_ENV, FAKE_SECRET)
    runSizingJob.mockResolvedValue('succeeded')
    const handler = await loadHandler()
    const res = await handler(req({ [SIZING_SECRET_HEADER]: FAKE_SECRET }))
    expect(res.status).toBe(202)
    expect(runSizingJob).toHaveBeenCalledTimes(1)
    // The jobId from the body reaches the compute — proving we got past auth
    // into the real work path, not merely past the status check.
    expect(runSizingJob.mock.calls[0]?.[1]).toBe('job-123')
  })

  it('does not echo the secret in any refusal body', async () => {
    vi.stubEnv(SIZING_SECRET_ENV, FAKE_SECRET)
    const handler = await loadHandler()
    const res = await handler(req({ [SIZING_SECRET_HEADER]: FAKE_WRONG }))
    const text = await res.text()
    expect(text).not.toContain(FAKE_SECRET)
    expect(text).not.toContain(FAKE_WRONG)
  })
})

/**
 * Caller-side wiring. Source-level assertions rather than a live fetch, because
 * the point is that the header is attached at the single chokepoint and the
 * secret is never client-exposed.
 */
describe('caller wiring — triggerSizingJob attaches the header', () => {
  const repoRoot = join(__dirname, '..', '..', '..')
  const jobs = readFileSync(join(repoRoot, 'src', 'lib', 'territory-sizing-jobs.ts'), 'utf8')

  it('imports the shared header/env constants rather than hardcoding them', () => {
    expect(jobs).toMatch(/import\s*\{[^}]*SIZING_SECRET_HEADER[^}]*\}\s*from\s*'\.\/sizing-function-auth'/)
  })

  it('attaches the secret header on the background-function fetch', () => {
    expect(jobs).toMatch(/\[SIZING_SECRET_HEADER\]\s*:\s*secret/)
  })

  it('fails closed when the secret is unprovisioned instead of sending unauthenticated', () => {
    expect(jobs).toMatch(/sizing function secret not provisioned/)
  })

  it('never uses a NEXT_PUBLIC_ prefixed variable for the secret', () => {
    expect(jobs).not.toMatch(/NEXT_PUBLIC[A-Z_]*SIZING/)
    const authMod = readFileSync(join(repoRoot, 'src', 'lib', 'sizing-function-auth.ts'), 'utf8')
    expect(authMod).not.toMatch(/NEXT_PUBLIC/)
  })
})

/**
 * Runtime serve-refusal (#182). The predicate is shared with the build guard;
 * these pin the serving-side semantics and the middleware wiring.
 */
describe('runtime serve-refusal', () => {
  // The env shapes below mirror what was MEASURED in the edge runtime, not what a
  // build environment looks like. See isHostedRuntime's docblock for the readings.
  const HOSTED_RUNTIME = { SITE_ID: 'site-uuid', SITE_NAME: 'ghmdsalesplatform', URL: 'https://x' }

  it('refuses when hosted AND the bypass variable is present', () => {
    expect(shouldRefuseServing({ ...HOSTED_RUNTIME, AUTH_GATE_DISABLED: 'true' })).toBe(true)
  })

  it('refuses even when the bypass value is falsy — presence is the trigger', () => {
    expect(shouldRefuseServing({ ...HOSTED_RUNTIME, AUTH_GATE_DISABLED: 'false' })).toBe(true)
    expect(shouldRefuseServing({ ...HOSTED_RUNTIME, AUTH_GATE_DISABLED: '' })).toBe(true)
  })

  it('serves normally when hosted without the bypass — the target state', () => {
    expect(shouldRefuseServing(HOSTED_RUNTIME)).toBe(false)
  })

  // ── The regression this suite exists to prevent ──────────────────────────
  // The first implementation keyed the RUNTIME check on NETLIFY, which is BUILD
  // metadata and is absent at serve time. shouldRefuseServing therefore returned
  // false while the bypass was live, and the app served /dashboard 200
  // unauthenticated on a real preview. These pin the exact measured shape.
  it('REFUSES with the real edge-runtime env shape — NETLIFY absent', () => {
    expect(shouldRefuseServing({ SITE_ID: 'site-uuid', AUTH_GATE_DISABLED: 'true' })).toBe(true)
    expect(shouldRefuseServing({ SITE_NAME: 'ghmdsalesplatform', AUTH_GATE_DISABLED: 'true' })).toBe(true)
    expect(shouldRefuseServing({ URL: 'https://x', AUTH_GATE_DISABLED: 'true' })).toBe(true)
  })

  it('does NOT depend on any build-only variable', () => {
    // NETLIFY alone must not be what makes it fire...
    expect(shouldRefuseServing({ NETLIFY: 'true', AUTH_GATE_DISABLED: 'true' })).toBe(false)
    // ...nor NODE_ENV, which the probe measured as absent in the edge runtime.
    expect(shouldRefuseServing({ NODE_ENV: 'production', AUTH_GATE_DISABLED: 'true' })).toBe(false)
  })

  it('any single observed-present marker is sufficient — survives Netlify dropping one', () => {
    expect(isHostedRuntime({ SITE_ID: 'x' })).toBe(true)
    expect(isHostedRuntime({ SITE_NAME: 'x' })).toBe(true)
    expect(isHostedRuntime({ URL: 'x' })).toBe(true)
    expect(isHostedRuntime({})).toBe(false)
    expect(isHostedRuntime({ SITE_ID: '', SITE_NAME: '  ' })).toBe(false)
  })

  it('the build guard is unchanged — still keys on NETLIFY', () => {
    expect(shouldRefuseDeployment({ NETLIFY: 'true', AUTH_GATE_DISABLED: 'true' })).toBe(true)
    expect(shouldRefuseDeployment({ SITE_ID: 'x', AUTH_GATE_DISABLED: 'true' })).toBe(false)
  })

  it('serves in local dev with the bypass — dev ergonomics preserved per §7.1', () => {
    // No Netlify runtime markers locally, so the bypass still works for `next dev`.
    expect(shouldRefuseServing({ AUTH_GATE_DISABLED: 'true' })).toBe(false)
  })

  it('serves on a plain local run', () => {
    expect(shouldRefuseServing({})).toBe(false)
  })

  describe('middleware wiring', () => {
    const repoRoot = join(__dirname, '..', '..', '..')
    const mwFull = readFileSync(join(repoRoot, 'src', 'middleware.ts'), 'utf8')
    // Anchor every positional assertion to the middleware FUNCTION BODY, not the
    // whole file. Helpers defined above the function (e.g. the temporary PR #151
    // guard probe) also reference shouldRefuseServing, so a file-wide indexOf
    // would silently measure the wrong occurrence and assert nothing meaningful.
    const mw = mwFull.slice(mwFull.indexOf('export async function middleware'))

    it('middleware imports and calls the shared predicate', () => {
      expect(mwFull).toMatch(/import\s*\{[^}]*shouldRefuseServing[^}]*\}/)
      expect(mw).toMatch(/shouldRefuseServing\s*\(\s*process\.env\s*\)/)
    })

    it('the refusal runs BEFORE the Supabase client is constructed', () => {
      const refuseIndex = mw.indexOf('shouldRefuseServing(process.env)')
      const clientIndex = mw.indexOf('createServerClient(')
      expect(refuseIndex).toBeGreaterThan(-1)
      expect(clientIndex).toBeGreaterThan(-1)
      expect(refuseIndex).toBeLessThan(clientIndex)
    })

    it('the refusal runs BEFORE the auth-gate redirect decision', () => {
      const refuseIndex = mw.indexOf('shouldRefuseServing(process.env)')
      const gateIndex = mw.indexOf('shouldRedirectToLogin(')
      expect(refuseIndex).toBeLessThan(gateIndex)
    })

    it('responds 503 and leaks no environment detail', () => {
      expect(mw).toMatch(/status:\s*503/)
      // The response body must not name the variable an attacker would target.
      const bodyString = mw.match(/'([^']*unavailable[^']*)'/)?.[1] ?? ''
      expect(bodyString).toMatch(/Service temporarily unavailable/)
      expect(bodyString).not.toContain('AUTH_GATE_DISABLED')
      expect(bodyString).not.toContain('NETLIFY')
    })
  })
})
