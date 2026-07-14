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
  getQaExecCredentials,
  getQaSeatCredentials,
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

describe('getQaExecCredentials', () => {
  it('returns creds from env when both are present', () => {
    expect(getQaExecCredentials(CREDS_ENV)).toEqual({
      email: 'qa@example.test',
      password: 'pw',
    })
  })

  it('throws naming the missing var(s), without leaking values', () => {
    expect(() => getQaExecCredentials({ QA_EXEC_EMAIL: 'x' })).toThrow(/QA_EXEC_PASSWORD/)
    expect(() => getQaExecCredentials({})).toThrow(/QA_EXEC_EMAIL/)
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
    expect(getQaSeatCredentials('exec', ALL_SEATS_ENV).email).toBe('qa-exec@example.test')
    expect(getQaSeatCredentials('rep-a', ALL_SEATS_ENV).email).toBe('qa-rep-a@example.test')
    expect(getQaSeatCredentials('rep-b', ALL_SEATS_ENV).email).toBe('qa-rep-b@example.test')
    // Rep A and Rep B must be genuinely distinct principals — AC5 (one rep cannot read the
    // other's pending post) is meaningless if both sessions are the same user.
    expect(getQaSeatCredentials('rep-a', ALL_SEATS_ENV)).not.toEqual(
      getQaSeatCredentials('rep-b', ALL_SEATS_ENV),
    )
  })

  it('throws naming the missing var, without leaking values', () => {
    expect(() => getQaSeatCredentials('rep-a', { QA_REP_A_EMAIL: 'x' })).toThrow(
      /QA_REP_A_PASSWORD/,
    )
    expect(() => getQaSeatCredentials('rep-b', {})).toThrow(/QA_REP_B_EMAIL/)
  })

  it('rejects an unknown seat rather than falling back to some default credential', () => {
    expect(() =>
      getQaSeatCredentials('rep-z' as never, ALL_SEATS_ENV),
    ).toThrow(/Unknown QA seat/)
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
