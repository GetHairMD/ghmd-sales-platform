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
  assertPreviewHost,
  getQaExecCredentials,
  preparePreviewLogin,
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
