/**
 * Tests for the PR-0a build-time deployment guard (GHMD-CRM-003 v1.1 §7.1).
 *
 * The guard's whole purpose is to make one misconfiguration impossible: a
 * hosted Netlify deploy that ships with the auth bypass enabled. These tests
 * pin both directions — it must refuse when it should, and it must NOT refuse
 * when it shouldn't (a guard that fails a legitimate local build gets disabled
 * by the first developer it inconveniences, which is its own security failure).
 *
 * Note the deliberate divergence from `auth-gate.test.ts`: that suite asserts
 * the runtime bypass activates ONLY on the exact string 'true'. This suite
 * asserts the build guard refuses on PRESENCE regardless of value. Both are
 * fail-closed; they just fail closed toward different safe states. See the
 * header of `src/lib/deployment-guard.ts` for why.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEPLOYMENT_REFUSED_MESSAGE,
  isAuthGateVarPresent,
  isHostedBuild,
  shouldRefuseDeployment,
} from '../deployment-guard.mjs'

describe('isHostedBuild', () => {
  it('is true for the NETLIFY=true that Netlify actually sets', () => {
    expect(isHostedBuild({ NETLIFY: 'true' })).toBe(true)
  })

  it('is false when NETLIFY is absent — the local-development case §7.1 permits', () => {
    expect(isHostedBuild({})).toBe(false)
  })

  // Fail-closed: a re-cased or typo'd value must not silently downgrade a
  // hosted build to "local" and thereby skip the guard entirely.
  it.each(['True', 'TRUE', '1', 'yes', 'false', ' true '])(
    'treats any non-empty NETLIFY value as hosted: %j',
    (value) => {
      expect(isHostedBuild({ NETLIFY: value })).toBe(true)
    },
  )

  it.each(['', '   '])('treats empty/whitespace NETLIFY as not hosted: %j', (value) => {
    expect(isHostedBuild({ NETLIFY: value })).toBe(false)
  })
})

describe('isAuthGateVarPresent', () => {
  it('is false when the variable is absent — the target state after PR-0a', () => {
    expect(isAuthGateVarPresent({})).toBe(false)
  })

  // Presence, not truthiness. Every one of these means "still configured in the
  // Netlify UI", which is the state §7.1 ends.
  it.each(['true', 'false', '1', '0', 'no', 'True', ''])(
    'is true for any defined value, including falsy ones: %j',
    (value) => {
      expect(isAuthGateVarPresent({ AUTH_GATE_DISABLED: value })).toBe(true)
    },
  )

  it('is true even for an explicitly-empty variable — blanking is not removal', () => {
    expect(isAuthGateVarPresent({ AUTH_GATE_DISABLED: '' })).toBe(true)
  })
})

describe('shouldRefuseDeployment', () => {
  it('REFUSES a hosted build with the bypass set — the core §7.1 rule', () => {
    expect(shouldRefuseDeployment({ NETLIFY: 'true', AUTH_GATE_DISABLED: 'true' })).toBe(true)
  })

  // The trap this closes: an operator "disables" the bypass by setting it to
  // false rather than deleting it. The variable is still configured, so the
  // build must still refuse.
  it('REFUSES a hosted build with the bypass set to a falsy value', () => {
    expect(shouldRefuseDeployment({ NETLIFY: 'true', AUTH_GATE_DISABLED: 'false' })).toBe(true)
    expect(shouldRefuseDeployment({ NETLIFY: 'true', AUTH_GATE_DISABLED: '' })).toBe(true)
  })

  it('ALLOWS a hosted build with the variable absent — the post-PR-0a target state', () => {
    expect(shouldRefuseDeployment({ NETLIFY: 'true' })).toBe(false)
  })

  it('ALLOWS a local build with the bypass set — the permitted local-dev case', () => {
    expect(shouldRefuseDeployment({ AUTH_GATE_DISABLED: 'true' })).toBe(false)
  })

  it('ALLOWS a plain local build', () => {
    expect(shouldRefuseDeployment({})).toBe(false)
  })

  // §7.1 is explicit: hosted = enforced, regardless of context. Gating on
  // CONTEXT values is the misconfiguration-by-drift the rule was simplified to
  // eliminate, so every context must refuse identically.
  it.each(['production', 'deploy-preview', 'branch-deploy', 'dev'])(
    'refuses identically in every Netlify CONTEXT: %s',
    (context) => {
      expect(
        shouldRefuseDeployment({ NETLIFY: 'true', CONTEXT: context, AUTH_GATE_DISABLED: 'true' }),
      ).toBe(true)
    },
  )

  it('does not consult CONTEXT at all — an unknown context still refuses', () => {
    expect(
      shouldRefuseDeployment({
        NETLIFY: 'true',
        CONTEXT: 'some-future-context-that-does-not-exist-yet',
        AUTH_GATE_DISABLED: 'true',
      }),
    ).toBe(true)
  })
})

/**
 * Enforcement-wiring regression tests.
 *
 * The predicate being correct is worthless if nothing calls it. PR-0a's first
 * implementation put enforcement solely in the `prebuild` npm hook, which npm
 * skips entirely under ignore-scripts — a guard that is never invoked never gets
 * to fail closed. These tests pin the wiring itself so that regression cannot
 * happen silently again.
 *
 * They assert on file contents rather than importing next.config.mjs, because
 * importing it would execute `enforceDeploymentGuard` (and `process.exit`) in
 * the test process.
 */
describe('enforcement wiring — next.config.mjs is the control', () => {
  const repoRoot = join(__dirname, '..', '..', '..')
  const nextConfig = readFileSync(join(repoRoot, 'next.config.mjs'), 'utf8')

  it('next.config.mjs imports the guard from the single shared module', () => {
    expect(nextConfig).toContain('deployment-guard.mjs')
    expect(nextConfig).toMatch(/import\s*\{[^}]*enforceDeploymentGuard[^}]*\}/)
  })

  it('next.config.mjs actually CALLS the guard, not merely imports it', () => {
    expect(nextConfig).toMatch(/enforceDeploymentGuard\s*\(\s*process\.env\s*\)/)
  })

  it('the guard call sits at module scope, above the exported config', () => {
    const callIndex = nextConfig.indexOf('enforceDeploymentGuard(process.env)')
    const exportIndex = nextConfig.indexOf('export default')
    expect(callIndex).toBeGreaterThan(-1)
    expect(exportIndex).toBeGreaterThan(-1)
    // Must run on import, before Next consumes the config.
    expect(callIndex).toBeLessThan(exportIndex)
  })

  it('the prebuild hook is retained as the early-warning trip-wire', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts.prebuild).toContain('check-deployment-guard')
    // ...and the build script itself is still what netlify.toml invokes.
    expect(pkg.scripts.build).toContain('next build')
  })
})

describe('DEPLOYMENT_REFUSED_MESSAGE', () => {
  // Pinned verbatim: the brief specifies this exact string, and the operator
  // reading a failed Netlify build log is the audience.
  it('is the exact message the brief specifies', () => {
    expect(DEPLOYMENT_REFUSED_MESSAGE).toBe(
      'AUTH_GATE_DISABLED is set in a hosted context — deployment refused per GHMD-CRM-003 v1.1 §7.1',
    )
  })
})
