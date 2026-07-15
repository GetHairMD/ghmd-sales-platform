import { describe, expect, it } from 'vitest'
import {
  isAuthGateDisabled,
  isPublicPath,
  shouldRedirectToLogin,
} from '../auth-gate'

/**
 * Auth-gate bypass — TEMPORARY, decisions #136/#137 (2026-07-11).
 *
 * The whole point of AUTH_GATE_DISABLED is FAIL-CLOSED: auth is required by
 * default, and ONLY the exact string 'true' disables it. Every other state —
 * unset, empty, wrong-case, near-miss truthy — must keep auth required. These
 * tests are the fail-closed proof; the near-miss cases are the adversarial pass
 * (a malformed/typo'd env var must NEVER open the app).
 */

describe('isAuthGateDisabled — fail-closed env predicate', () => {
  it('is true ONLY for the exact string "true"', () => {
    expect(isAuthGateDisabled('true')).toBe(true)
  })

  // Everything below is a state that must NOT disable the gate.
  const mustStayClosed: Array<[string, string | undefined]> = [
    ['unset / missing', undefined],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['leading space', ' true'],
    ['trailing space', 'true '],
    ['capitalised', 'True'],
    ['all caps', 'TRUE'],
    ['numeric one', '1'],
    ['yes', 'yes'],
    ['on', 'on'],
    ['enabled', 'enabled'],
    ['false', 'false'],
    ['truthy-looking substring', 'truer'],
    ['quoted true', '"true"'],
    ['newline-wrapped', 'true\n'],
  ]

  for (const [label, value] of mustStayClosed) {
    it(`stays closed for ${label} (${JSON.stringify(value)})`, () => {
      expect(isAuthGateDisabled(value)).toBe(false)
    })
  }
})

describe('isPublicPath — unauthenticated-reachable prefixes', () => {
  const publicPaths = [
    '/login',
    '/login/',
    '/proposals/abc-123',
    '/p/some-slug',
    '/r/deadbeefcafe', // E-3 tracked-link route — a prospect opens it unauthenticated
  ]
  for (const p of publicPaths) {
    it(`treats ${p} as public`, () => {
      expect(isPublicPath(p)).toBe(true)
    })
  }

  const gatedPaths = [
    '/',
    '/dashboard',
    '/proposals', // bare index is REP-facing — must stay gated
    '/resources', // REP-facing Field Kit index — the trailing-slash /r/ must NOT match it
    '/pipeline',
    '/territories/abc',
    '/prospects',
  ]
  for (const p of gatedPaths) {
    it(`treats ${p} as gated`, () => {
      expect(isPublicPath(p)).toBe(false)
    })
  }
})

describe('shouldRedirectToLogin — composed gate decision', () => {
  it('Test 1: env unset → protected path still redirects', () => {
    expect(
      shouldRedirectToLogin({
        hasUser: false,
        pathname: '/dashboard',
        authGateDisabledEnv: undefined,
      })
    ).toBe(true)
  })

  it('Test 2: env "true" → no redirect on a protected path', () => {
    expect(
      shouldRedirectToLogin({
        hasUser: false,
        pathname: '/dashboard',
        authGateDisabledEnv: 'true',
      })
    ).toBe(false)
  })

  describe('Test 3: near-miss truthy env values still redirect (fail-closed)', () => {
    for (const value of ['True', '1', ' true', '', 'TRUE', 'yes']) {
      it(`env ${JSON.stringify(value)} → still redirects`, () => {
        expect(
          shouldRedirectToLogin({
            hasUser: false,
            pathname: '/dashboard',
            authGateDisabledEnv: value,
          })
        ).toBe(true)
      })
    }
  })

  describe('Test 4: public paths unaffected either way', () => {
    for (const env of [undefined, 'true', 'True', '']) {
      for (const pathname of ['/login', '/proposals/abc', '/p/slug']) {
        it(`no redirect for ${pathname} (env ${JSON.stringify(env)})`, () => {
          expect(
            shouldRedirectToLogin({
              hasUser: false,
              pathname,
              authGateDisabledEnv: env,
            })
          ).toBe(false)
        })
      }
    }
  })

  it('an authenticated user is never redirected (unchanged default)', () => {
    expect(
      shouldRedirectToLogin({
        hasUser: true,
        pathname: '/dashboard',
        authGateDisabledEnv: undefined,
      })
    ).toBe(false)
  })
})
