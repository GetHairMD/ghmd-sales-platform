/**
 * preview-login.test.ts — proves the deploy-preview hostname guard is load-bearing.
 *
 * The QA-exec account has no prod/preview DB isolation (single Supabase project behind
 * both), so these assertions ARE the isolation. Each "rejects" case is a host the
 * QA-exec credential must never reach.
 */
import { describe, it, expect } from 'vitest'
import {
  PREVIEW_HOST_PATTERN,
  QA_SEATS,
  assertPreviewHost,
  preparePreviewLogin,
  preparePreviewLoginAs,
} from './preview-login'

const VALID = 'https://deploy-preview-123--ghmdsalesplatform.netlify.app'
const CREDS_ENV = { QA_EXEC_EMAIL: 'qa@example.test', QA_EXEC_PASSWORD: 'pw' }

describe('assertPreviewHost — accepts sanctioned deploy previews', () => {
  it('accepts a deploy-preview URL and returns the lowercased host', () => {
    expect(assertPreviewHost(VALID)).toBe(
      'deploy-preview-123--ghmdsalesplatform.netlify.app',
    )
  })

  it('accepts regardless of path, query, or trailing slash', () => {
    expect(
      assertPreviewHost(`${VALID}/prospects?tab=all#x`),
    ).toBe('deploy-preview-123--ghmdsalesplatform.netlify.app')
  })

  it('accepts any numeric PR id', () => {
    expect(
      assertPreviewHost('https://deploy-preview-7--ghmdsalesplatform.netlify.app'),
    ).toBe('deploy-preview-7--ghmdsalesplatform.netlify.app')
  })
})

describe('assertPreviewHost — refuses everything else', () => {
  const rejected: Array<[string, string]> = [
    ['production primary host', 'https://ghmdsalesplatform.netlify.app'],
    ['branch deploy of main (prod-equivalent)', 'https://main--ghmdsalesplatform.netlify.app'],
    ['arbitrary branch deploy', 'https://feature-x--ghmdsalesplatform.netlify.app'],
    ['the NIP site', 'https://ghmdnetwork.netlify.app'],
    ['suffix-decoy host', 'https://deploy-preview-1--ghmdsalesplatform.netlify.app.evil.com'],
    ['subdomain-decoy host', 'https://deploy-preview-1--ghmdsalesplatform.netlify.app.attacker.io/login'],
    ['preview string only in path', 'https://evil.com/deploy-preview-1--ghmdsalesplatform.netlify.app'],
    ['preview string only in query', 'https://evil.com/?to=deploy-preview-1--ghmdsalesplatform.netlify.app'],
    ['embedded userinfo decoy', 'https://deploy-preview-1--ghmdsalesplatform.netlify.app@evil.com'],
    ['non-numeric PR id', 'https://deploy-preview-abc--ghmdsalesplatform.netlify.app'],
    ['missing deploy-preview prefix', 'https://123--ghmdsalesplatform.netlify.app'],
    ['http downgrade', 'http://deploy-preview-1--ghmdsalesplatform.netlify.app'],
    ['localhost', 'http://localhost:3000'],
    ['not a URL', 'deploy-preview-1--ghmdsalesplatform.netlify.app'],
    ['empty string', ''],
  ]

  for (const [label, url] of rejected) {
    it(`refuses ${label}`, () => {
      expect(() => assertPreviewHost(url)).toThrow(/preview-login/)
    })
  }
})

describe('PREVIEW_HOST_PATTERN', () => {
  it('is anchored and requires a numeric PR id', () => {
    expect(PREVIEW_HOST_PATTERN.test('deploy-preview-9--ghmdsalesplatform.netlify.app')).toBe(true)
    expect(PREVIEW_HOST_PATTERN.test('deploy-preview---ghmdsalesplatform.netlify.app')).toBe(false)
    expect(PREVIEW_HOST_PATTERN.test('xdeploy-preview-9--ghmdsalesplatform.netlify.app')).toBe(false)
    expect(PREVIEW_HOST_PATTERN.test('deploy-preview-9--ghmdsalesplatform.netlify.appx')).toBe(false)
  })
})

/**
 * Second-Opinion Gate BLOCK #7 (Sol 5.6, PR #130) — the credential accessors are module-private.
 *
 * FINDING (in part, verbatim): "…exported `getQaSeatCredentials()` returns their credentials
 * without invoking the guard at all."
 *
 * True, and it predates E-2: `getQaExecCredentials` was exported the same way in PR #121. So
 * the module shipped a path to the password that never ran `assertPreviewHost` — which made the
 * header's own invariant ("there is no sanctioned path to the password that skips the guard")
 * false as written. E-2 widened it from one credential to three.
 *
 * Both accessors are now module-private. These tests therefore exercise credential resolution
 * ONLY through the guarded entry points — which is the whole point: if a test could still reach
 * the raw accessor, so could a caller.
 *
 * NOTE what this does NOT fix: the seats remain real production principals (one Supabase
 * project behind prod and every preview). Anyone holding the raw env vars can still reach
 * production directly, without importing this file at all. That is a property of the credential
 * architecture (decisions #146 / #161), flagged to Trace, not something this module can close.
 */
describe('BLOCK #7 — no credential accessor escapes the module unguarded', () => {
  it('does not export getQaExecCredentials / getQaSeatCredentials', async () => {
    const mod: Record<string, unknown> = await import('./preview-login')
    expect(Object.keys(mod)).not.toContain('getQaExecCredentials')
    expect(Object.keys(mod)).not.toContain('getQaSeatCredentials')
  })

  it('exports only the guarded entry points + the non-secret helpers', async () => {
    const mod: Record<string, unknown> = await import('./preview-login')
    const exportedFns = Object.keys(mod).filter((k) => typeof mod[k] === 'function')
    expect(exportedFns.sort()).toEqual(
      ['assertPreviewHost', 'preparePreviewLogin', 'preparePreviewLoginAs'].sort(),
    )
  })

  it('surfaces a missing env var through the GUARDED path (behaviour preserved)', () => {
    // Same coverage the old unguarded accessor tests gave, routed through the guard: a valid
    // preview host passes the assertion, then the missing var is named — without leaking values.
    expect(() => preparePreviewLogin(VALID, { QA_EXEC_EMAIL: 'x' })).toThrow(/QA_EXEC_PASSWORD/)
    expect(() => preparePreviewLogin(VALID, {})).toThrow(/QA_EXEC_EMAIL/)
    expect(() => preparePreviewLoginAs('rep-a', VALID, { QA_REP_A_EMAIL: 'x' })).toThrow(
      /QA_REP_A_PASSWORD/,
    )
    expect(() => preparePreviewLoginAs('rep-b', VALID, {})).toThrow(/QA_REP_B_EMAIL/)
  })

  it('rejects an unknown seat rather than falling back to some default credential', () => {
    expect(() =>
      preparePreviewLoginAs('rep-z' as never, VALID, ALL_SEATS_ENV),
    ).toThrow(/Unknown QA seat/)
  })
})

describe('preparePreviewLogin — guard is sequenced before credential access', () => {
  it('returns host + creds for a valid preview target', () => {
    expect(preparePreviewLogin(VALID, CREDS_ENV)).toEqual({
      host: 'deploy-preview-123--ghmdsalesplatform.netlify.app',
      email: 'qa@example.test',
      password: 'pw',
    })
  })

  it('throws on the hostname BEFORE reading credentials (prod URL, creds present)', () => {
    expect(() =>
      preparePreviewLogin('https://ghmdsalesplatform.netlify.app', CREDS_ENV),
    ).toThrow(/not a ghmd-sales-platform deploy-preview host/)
  })

  it('still refuses an off-preview host even when credentials are absent', () => {
    expect(() =>
      preparePreviewLogin('https://ghmdsalesplatform.netlify.app', {}),
    ).toThrow(/deploy-preview host/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// E-2 (decision #161): the two REP seats. They are REAL production principals with no
// prod/preview DB isolation, exactly like the exec — so the guard must cover them
// identically. A rep seat that could reach production would be a regression of the whole
// point of this file.
// ─────────────────────────────────────────────────────────────────────────────
const ALL_SEATS_ENV = {
  QA_EXEC_EMAIL: 'qa-exec@example.test',
  QA_EXEC_PASSWORD: 'pw-exec',
  QA_REP_A_EMAIL: 'qa-rep-a@example.test',
  QA_REP_A_PASSWORD: 'pw-a',
  QA_REP_B_EMAIL: 'qa-rep-b@example.test',
  QA_REP_B_PASSWORD: 'pw-b',
}

describe('QA seats — rep fixtures inherit the exec seat\'s guard', () => {
  it('exposes exactly the three known seats', () => {
    expect(QA_SEATS).toEqual(['exec', 'rep-a', 'rep-b'])
  })

  it('resolves each seat to its OWN credentials (no cross-wiring)', () => {
    // Routed through the GUARDED entry point — the raw accessor is module-private (BLOCK #7).
    expect(preparePreviewLoginAs('exec', VALID, ALL_SEATS_ENV).email).toBe('qa-exec@example.test')
    expect(preparePreviewLoginAs('rep-a', VALID, ALL_SEATS_ENV).email).toBe('qa-rep-a@example.test')
    expect(preparePreviewLoginAs('rep-b', VALID, ALL_SEATS_ENV).email).toBe('qa-rep-b@example.test')
    // Rep A and Rep B must be genuinely distinct principals — AC5 (one rep cannot read the
    // other's pending post) is meaningless if both sessions are the same user.
    expect(preparePreviewLoginAs('rep-a', VALID, ALL_SEATS_ENV).password).not.toBe(
      preparePreviewLoginAs('rep-b', VALID, ALL_SEATS_ENV).password,
    )
  })

  for (const seat of QA_SEATS) {
    it(`preparePreviewLoginAs("${seat}") returns host + creds on a valid preview`, () => {
      const login = preparePreviewLoginAs(seat, VALID, ALL_SEATS_ENV)
      expect(login.host).toBe('deploy-preview-123--ghmdsalesplatform.netlify.app')
      expect(login.email).toBeTruthy()
      expect(login.password).toBeTruthy()
    })

    it(`preparePreviewLoginAs("${seat}") REFUSES production even with creds present`, () => {
      expect(() =>
        preparePreviewLoginAs(seat, 'https://ghmdsalesplatform.netlify.app', ALL_SEATS_ENV),
      ).toThrow(/not a ghmd-sales-platform deploy-preview host/)
    })

    it(`preparePreviewLoginAs("${seat}") REFUSES the NIP site`, () => {
      expect(() =>
        preparePreviewLoginAs(seat, 'https://ghmdnetwork.netlify.app', ALL_SEATS_ENV),
      ).toThrow(/preview-login/)
    })
  }

  it('preparePreviewLogin (legacy signature) still means the exec seat', () => {
    expect(preparePreviewLogin(VALID, ALL_SEATS_ENV).email).toBe('qa-exec@example.test')
  })
})
