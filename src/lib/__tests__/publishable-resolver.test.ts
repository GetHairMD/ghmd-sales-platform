import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabasePublishableKey } from '../supabase/publishable-key'
import { getGatePublishableKey } from '../../../scripts/second-opinion-gate/publishable-key'

// Allowlisted declaration lines — see publishable-read-sites.test.ts branch (e).
const APP_PREFERRED_VAR = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
const APP_LEGACY_VAR = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
const CI_PREFERRED_VAR = 'SUPABASE_PUBLISHABLE_KEY'
const CI_LEGACY_VAR = 'SUPABASE_ANON_KEY'

/**
 * Publishable-key resolvers — application and Second-Opinion Gate.
 *
 * Both resolvers implement the identical contract, so both are driven through the identical
 * matrix here rather than one being tested and the other assumed:
 *   1. preferred: absent / empty / whitespace-only -> fall through; padded non-blank -> THROW;
 *      clean -> return verbatim.
 *   2. legacy: identical rule — a padded legacy value THROWS rather than being silently skipped.
 *   3. neither present -> THROW naming BOTH variables (fail closed).
 *
 * ⚠ EVIDENTIARY LIMIT — the point of these tests. A both-variable environment CANNOT prove the
 * preferred branch was taken, because the fallback would satisfy the same observable outcome. So
 * these deterministic tests, which set the variables independently, are the ONLY place preferred-
 * path selection is proven at this stage. Operational preferred-path proof happens only after the
 * legacy variables are removed, during the new-only rollout step — not from any run in which both
 * variables are present.
 *
 * ⚠ SENSITIVITY. Unlike the service-credential suites, the values here are PUBLIC by design — the
 * app's publishable key is inlined into the client bundle on purpose. The leakage assertions below
 * are therefore about hygiene and about not normalising value-echoing in error paths, NOT about
 * protecting a secret. Do not infer from this file that a publishable key is confidential, and do
 * not relax the service-credential suites to match it.
 *
 * ⚠ Env is manipulated ONLY through `vi.stubEnv`; no test reads a real environment value.
 */

/**
 * Synthetic values carrying unique marker substrings, so "did the value leak?" is decidable.
 * A designated unique substring is asserted separately from the whole value: an error renderer
 * that truncated a value would still fail the marker assertion, which is the point.
 */
const APP_PREFERRED_MARKER = 'QX7ZAPPPREFMARKER'
const APP_LEGACY_MARKER = 'QX7ZAPPLEGACYMARKER'
const CI_PREFERRED_MARKER = 'QX7ZCIPREFMARKER'
const CI_LEGACY_MARKER = 'QX7ZCILEGACYMARKER'

const APP_PREFERRED_SENTINEL = `sb_publishable_synthetic-${APP_PREFERRED_MARKER}-0000`
const APP_LEGACY_SENTINEL = `synthetic-not-a-real-key-${APP_LEGACY_MARKER}-0000`
const CI_PREFERRED_SENTINEL = `sb_publishable_synthetic-${CI_PREFERRED_MARKER}-0000`
const CI_LEGACY_SENTINEL = `synthetic-not-a-real-key-${CI_LEGACY_MARKER}-0000`

interface ResolverCase {
  label: string
  resolve: () => string
  preferredVar: string
  legacyVar: string
  preferredSentinel: string
  legacySentinel: string
  preferredMarker: string
  legacyMarker: string
}

const RESOLVERS: ResolverCase[] = [
  {
    label: 'application (getSupabasePublishableKey)',
    resolve: getSupabasePublishableKey,
    preferredVar: APP_PREFERRED_VAR,
    legacyVar: APP_LEGACY_VAR,
    preferredSentinel: APP_PREFERRED_SENTINEL,
    legacySentinel: APP_LEGACY_SENTINEL,
    preferredMarker: APP_PREFERRED_MARKER,
    legacyMarker: APP_LEGACY_MARKER,
  },
  {
    label: 'gate CI (getGatePublishableKey)',
    resolve: getGatePublishableKey,
    preferredVar: CI_PREFERRED_VAR,
    legacyVar: CI_LEGACY_VAR,
    preferredSentinel: CI_PREFERRED_SENTINEL,
    legacySentinel: CI_LEGACY_SENTINEL,
    preferredMarker: CI_PREFERRED_MARKER,
    legacyMarker: CI_LEGACY_MARKER,
  },
]

/** Set (or, with `undefined`, unset) a variable for the current test only. */
function setVar(name: string, value: string | undefined): void {
  vi.stubEnv(name, value)
}

/** Every variable this suite touches, cleared before each test so no case inherits state. */
const ALL_VARS = [APP_PREFERRED_VAR, APP_LEGACY_VAR, CI_PREFERRED_VAR, CI_LEGACY_VAR]

beforeEach(() => {
  for (const name of ALL_VARS) setVar(name, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe.each(RESOLVERS)('$label — precedence and fail-closed contract', (c) => {
  it('prefers the modern value when BOTH are present, and does not return the fallback', () => {
    setVar(c.preferredVar, c.preferredSentinel)
    setVar(c.legacyVar, c.legacySentinel)
    const resolved = c.resolve()
    expect(resolved).toBe(c.preferredSentinel)
    // The discriminating half: the fallback value was not selected.
    expect(resolved).not.toBe(c.legacySentinel)
    expect(resolved).not.toContain(c.legacyMarker)
  })

  it('returns the modern value when it is the only one set', () => {
    setVar(c.preferredVar, c.preferredSentinel)
    expect(c.resolve()).toBe(c.preferredSentinel)
  })

  it('returns the value verbatim — no trimming, no normalisation of inner whitespace', () => {
    const withInnerSpace = `synthetic ${c.preferredMarker} inner-space`
    setVar(c.preferredVar, withInnerSpace)
    expect(c.resolve()).toBe(withInnerSpace)
  })

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace-only', '   '],
    ['tab/newline-only', '\t\n '],
  ])('falls back when the modern value is %s', (_label, value) => {
    setVar(c.preferredVar, value as string | undefined)
    setVar(c.legacyVar, c.legacySentinel)
    expect(c.resolve()).toBe(c.legacySentinel)
  })

  it.each([
    ['leading space', (v: string) => ` ${v}`],
    ['trailing space', (v: string) => `${v} `],
    ['leading newline', (v: string) => `\n${v}`],
    ['trailing tab', (v: string) => `${v}\t`],
  ])('THROWS on a modern value with a %s, and does NOT fall back', (_label, pad) => {
    setVar(c.preferredVar, pad(c.preferredSentinel))
    setVar(c.legacyVar, c.legacySentinel)
    // Falling through on a padded value would silently prefer the other variable — the operator
    // pasted something for THIS variable and must be told, not quietly overridden.
    expect(() => c.resolve()).toThrow(new RegExp(c.preferredVar))
  })

  it.each([
    ['leading space', (v: string) => ` ${v}`],
    ['trailing space', (v: string) => `${v} `],
  ])('THROWS on a fallback value with a %s rather than treating it as absent', (_label, pad) => {
    setVar(c.legacyVar, pad(c.legacySentinel))
    expect(() => c.resolve()).toThrow(new RegExp(c.legacyVar))
  })

  it.each([
    ['both unset', undefined, undefined],
    ['both empty', '', ''],
    ['both whitespace-only', '  ', '\t'],
    ['modern unset, fallback blank', undefined, ''],
  ])('THROWS naming BOTH variables when %s (fail closed)', (_label, preferred, legacy) => {
    setVar(c.preferredVar, preferred as string | undefined)
    setVar(c.legacyVar, legacy as string | undefined)
    let message = ''
    expect(() => {
      try {
        c.resolve()
      } catch (err) {
        message = err instanceof Error ? err.message : String(err)
        throw err
      }
    }).toThrow()
    expect(message).toContain(c.preferredVar)
    expect(message).toContain(c.legacyVar)
  })

  it('never echoes a value — neither the whole sentinel nor its unique marker', () => {
    // Every throwing shape, checked against both the full value and the designated substring.
    const shapes: Array<[string | undefined, string | undefined]> = [
      [` ${c.preferredSentinel} `, c.legacySentinel],
      [undefined, ` ${c.legacySentinel} `],
      [undefined, undefined],
    ]
    for (const [preferred, legacy] of shapes) {
      vi.unstubAllEnvs()
      for (const name of ALL_VARS) setVar(name, undefined)
      setVar(c.preferredVar, preferred)
      setVar(c.legacyVar, legacy)
      let message = ''
      try {
        c.resolve()
      } catch (err) {
        message = err instanceof Error ? err.message : String(err)
      }
      expect(message).not.toBe('')
      expect(message).not.toContain(c.preferredSentinel)
      expect(message).not.toContain(c.legacySentinel)
      expect(message).not.toContain(c.preferredMarker)
      expect(message).not.toContain(c.legacyMarker)
      expect(message).not.toContain('sb_publishable_')
    }
  })
})

describe('the two resolvers are independent', () => {
  it('the application resolver ignores the gate variables, and vice versa', () => {
    // The names differ by the NEXT_PUBLIC_ prefix, and one is a substring of the other — a shared
    // or prefix-tolerant implementation would cross-wire them. Set only the gate pair and confirm
    // the app resolver still fails closed, then the reverse.
    setVar(CI_PREFERRED_VAR, CI_PREFERRED_SENTINEL)
    setVar(CI_LEGACY_VAR, CI_LEGACY_SENTINEL)
    expect(() => getSupabasePublishableKey()).toThrow(new RegExp(APP_PREFERRED_VAR))
    expect(getGatePublishableKey()).toBe(CI_PREFERRED_SENTINEL)

    vi.unstubAllEnvs()
    for (const name of ALL_VARS) setVar(name, undefined)

    setVar(APP_PREFERRED_VAR, APP_PREFERRED_SENTINEL)
    expect(getSupabasePublishableKey()).toBe(APP_PREFERRED_SENTINEL)
    expect(() => getGatePublishableKey()).toThrow(new RegExp(CI_PREFERRED_VAR))
  })
})
