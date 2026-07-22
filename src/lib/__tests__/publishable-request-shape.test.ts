import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDeclarationRequest } from '../../../scripts/second-opinion-gate/declaration-rpc'

// Allowlisted declaration lines — see publishable-read-sites.test.ts branch (e).
const CI_PREFERRED_VAR = 'SUPABASE_PUBLISHABLE_KEY'
const CI_LEGACY_VAR = 'SUPABASE_ANON_KEY'

/**
 * Second-Opinion Gate declaration lookup — raw request shape.
 *
 * The gate's hand-authored PostgREST RPC call previously sent the credential on BOTH `apikey` and
 * `Authorization: Bearer`. This asserts it is now key-FORMAT-AGNOSTIC: credential on `apikey`
 * only, with no Authorization header at all.
 *
 * Rationale for the shape: conformity with Supabase's documented raw API-key contract — modern
 * publishable/secret keys belong in `apikey` and are not relied upon as Bearer credentials — and
 * removal of unnecessary header ambiguity, matching the residual-risk sweep's already-shipped
 * API-key-only shape.
 *
 * ⚠ SCOPE. This governs HAND-AUTHORED raw REST/RPC requests only. The Supabase SDK emits its own
 * headers for the application, including an Authorization header, and that remains the SDK's
 * responsibility — not a contract this fetch reproduces and not something this PR overrides. Real
 * user-session JWT handling is on the application path and is untouched.
 *
 * ⚠ EVIDENTIARY SCOPE. This proves request CONSTRUCTION and resolver PRECEDENCE with mocked env.
 * It does NOT, and pre-rollout cannot, prove that a modern publishable key authenticates against
 * hosted Supabase; that is provable only after the value is provisioned. No live request is made
 * here, and no real credential appears anywhere in this file.
 */

const PREFERRED_MARKER = 'QX7ZREQPREFMARKER'
const LEGACY_MARKER = 'QX7ZREQLEGACYMARKER'
const PREFERRED_SENTINEL = `sb_publishable_synthetic-${PREFERRED_MARKER}-0000`
const LEGACY_SENTINEL = `synthetic-not-a-real-key-${LEGACY_MARKER}-0000`
const URL_BASE = 'https://example.invalid'

const REPO = 'GetHairMD/ghmd-sales-platform'
const PR_NUMBER = 4242

function setVar(name: string, value: string | undefined): void {
  vi.stubEnv(name, value)
}

/** Header lookup that is deliberately case-INSENSITIVE: `authorization` must be absent in ANY casing. */
function headerKeys(init: RequestInit): string[] {
  return Object.keys((init.headers ?? {}) as Record<string, string>).map((k) => k.toLowerCase())
}

function headerValue(init: RequestInit, name: string): string | undefined {
  const entries = Object.entries((init.headers ?? {}) as Record<string, string>)
  const hit = entries.find(([k]) => k.toLowerCase() === name.toLowerCase())
  return hit?.[1]
}

beforeEach(() => {
  setVar('SUPABASE_URL', URL_BASE)
  setVar(CI_PREFERRED_VAR, undefined)
  setVar(CI_LEGACY_VAR, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('buildDeclarationRequest — API-key-only header shape', () => {
  it('places the modern publishable credential in apikey', () => {
    setVar(CI_PREFERRED_VAR, PREFERRED_SENTINEL)
    const { init } = buildDeclarationRequest(REPO, PR_NUMBER)
    expect(headerValue(init, 'apikey')).toBe(PREFERRED_SENTINEL)
  })

  it('sends NO Authorization header, in any casing', () => {
    setVar(CI_PREFERRED_VAR, PREFERRED_SENTINEL)
    const { init } = buildDeclarationRequest(REPO, PR_NUMBER)
    expect(headerKeys(init)).not.toContain('authorization')
    // Non-vacuous: the headers object is real and does carry the expected keys.
    expect(headerKeys(init)).toContain('apikey')
    expect(headerKeys(init)).toContain('content-type')
  })

  it('never places the credential value in ANY header other than apikey', () => {
    setVar(CI_PREFERRED_VAR, PREFERRED_SENTINEL)
    const { init } = buildDeclarationRequest(REPO, PR_NUMBER)
    const entries = Object.entries((init.headers ?? {}) as Record<string, string>)
    const carriers = entries.filter(([, v]) => v.includes(PREFERRED_MARKER)).map(([k]) => k.toLowerCase())
    expect(carriers).toEqual(['apikey'])
  })

  it('never places the credential value in the URL or the body', () => {
    setVar(CI_PREFERRED_VAR, PREFERRED_SENTINEL)
    const { url, init } = buildDeclarationRequest(REPO, PR_NUMBER)
    expect(url).not.toContain(PREFERRED_MARKER)
    expect(String(init.body ?? '')).not.toContain(PREFERRED_MARKER)
  })

  it('uses the legacy credential when the modern one is absent (compatibility phase)', () => {
    setVar(CI_LEGACY_VAR, LEGACY_SENTINEL)
    const { init } = buildDeclarationRequest(REPO, PR_NUMBER)
    expect(headerValue(init, 'apikey')).toBe(LEGACY_SENTINEL)
    expect(headerKeys(init)).not.toContain('authorization')
  })

  it('prefers the modern credential when both are present', () => {
    setVar(CI_PREFERRED_VAR, PREFERRED_SENTINEL)
    setVar(CI_LEGACY_VAR, LEGACY_SENTINEL)
    expect(headerValue(buildDeclarationRequest(REPO, PR_NUMBER).init, 'apikey')).toBe(PREFERRED_SENTINEL)
  })

  it('targets the RPC endpoint and scopes the lookup to (repo, pr)', () => {
    setVar(CI_PREFERRED_VAR, PREFERRED_SENTINEL)
    const { url, init } = buildDeclarationRequest(REPO, PR_NUMBER)
    expect(url).toBe(`${URL_BASE}/rest/v1/rpc/gate_decision_for_pr`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ p_repo: REPO, p_pr_number: PR_NUMBER })
  })

  it('strips trailing slashes from the project URL rather than emitting a double slash', () => {
    setVar('SUPABASE_URL', `${URL_BASE}///`)
    setVar(CI_PREFERRED_VAR, PREFERRED_SENTINEL)
    expect(buildDeclarationRequest(REPO, PR_NUMBER).url).toBe(
      `${URL_BASE}/rest/v1/rpc/gate_decision_for_pr`,
    )
  })
})

describe('buildDeclarationRequest — fail closed, without echoing values', () => {
  it('THROWS when no publishable credential is configured', () => {
    let message = ''
    try {
      buildDeclarationRequest(REPO, PR_NUMBER)
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain(CI_PREFERRED_VAR)
    expect(message).toContain(CI_LEGACY_VAR)
  })

  it('THROWS when the project URL is unset', () => {
    setVar('SUPABASE_URL', undefined)
    setVar(CI_PREFERRED_VAR, PREFERRED_SENTINEL)
    expect(() => buildDeclarationRequest(REPO, PR_NUMBER)).toThrow(/SUPABASE_URL/)
  })

  it('THROWS on a padded credential rather than sending it', () => {
    setVar(CI_PREFERRED_VAR, ` ${PREFERRED_SENTINEL} `)
    expect(() => buildDeclarationRequest(REPO, PR_NUMBER)).toThrow(new RegExp(CI_PREFERRED_VAR))
  })

  it('no thrown message echoes a credential value or its unique marker', () => {
    const shapes: Array<[string | undefined, string | undefined, string | undefined]> = [
      [undefined, undefined, URL_BASE],
      [` ${PREFERRED_SENTINEL} `, LEGACY_SENTINEL, URL_BASE],
      [undefined, ` ${LEGACY_SENTINEL} `, URL_BASE],
      [PREFERRED_SENTINEL, undefined, undefined],
    ]
    for (const [preferred, legacy, url] of shapes) {
      vi.unstubAllEnvs()
      setVar('SUPABASE_URL', url)
      setVar(CI_PREFERRED_VAR, preferred)
      setVar(CI_LEGACY_VAR, legacy)
      let message = ''
      try {
        buildDeclarationRequest(REPO, PR_NUMBER)
      } catch (err) {
        message = err instanceof Error ? err.message : String(err)
      }
      expect(message).not.toBe('')
      expect(message).not.toContain(PREFERRED_MARKER)
      expect(message).not.toContain(LEGACY_MARKER)
      expect(message).not.toContain(PREFERRED_SENTINEL)
      expect(message).not.toContain(LEGACY_SENTINEL)
      expect(message).not.toContain('sb_publishable_')
    }
  })
})
