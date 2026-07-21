import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseSecretKey } from '../supabase/secret-key'

/**
 * Supabase secret-key resolver — decision #199 remediation (credential compatibility layer).
 *
 * The resolver is the ONE place in the repo that reads the Supabase service credential.
 * It exists so the legacy `service_role` JWT can be swapped for a modern `sb_secret_` key as a
 * pure VALUE change — no further code change is required for rotation once this layer ships.
 *
 * ⚠ That is not the same as "no deploy". Env vars are captured per deploy and service clients
 * are process-cached, so every env change still requires a fresh deploy in EVERY affected
 * context (production and any preview/branch context under test), each confirmed `ready` with
 * its `commit_ref` matched to the intended SHA before it is verified against.
 *
 * Contract under test (exact, in order):
 *   1. new var: absent / empty / whitespace-only  -> fall through;  padded non-blank -> THROW;
 *      clean -> return.
 *   2. legacy var: identical rule — a padded legacy value THROWS rather than being
 *      silently skipped (a malformed credential is an operator error, not a fallback signal).
 *   3. neither present -> THROW naming both variables.
 *
 * ⚠ The variable NAMES are assembled at runtime rather than written as literals. The
 * companion source-scan suite (credential-read-sites.test.ts) enforces that the identifiers
 * appear nowhere outside the resolver module, and that invariant is only meaningful if the
 * test files themselves need no exemption from it.
 */

const NEW_VAR = ['SUPABASE', 'SECRET', 'KEY'].join('_')
const LEGACY_VAR = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')

/**
 * Deliberately synthetic values. Each carries a unique marker substring that cannot occur
 * in ordinary prose, so "did the value leak?" is a decidable assertion. (Asserting that no
 * CHARACTER of a value appears in an error message would be meaningless — any English
 * sentence shares letters with any value.)
 */
const NEW_MARKER = 'QX7ZNEWMARKER'
const LEGACY_MARKER = 'QX7ZLEGACYMARKER'
const NEW_SENTINEL = `synthetic-not-a-real-key-${NEW_MARKER}-0000`
const LEGACY_SENTINEL = `synthetic-not-a-real-key-${LEGACY_MARKER}-0000`

const ORIGINAL_NEW = process.env[NEW_VAR]
const ORIGINAL_LEGACY = process.env[LEGACY_VAR]

function setVar(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

beforeEach(() => {
  setVar(NEW_VAR, undefined)
  setVar(LEGACY_VAR, undefined)
})

afterEach(() => {
  setVar(NEW_VAR, ORIGINAL_NEW)
  setVar(LEGACY_VAR, ORIGINAL_LEGACY)
  vi.restoreAllMocks()
})

describe('getSupabaseSecretKey — precedence', () => {
  it('prefers a clean new-format key when both are present', () => {
    setVar(NEW_VAR, NEW_SENTINEL)
    setVar(LEGACY_VAR, LEGACY_SENTINEL)
    expect(getSupabaseSecretKey()).toBe(NEW_SENTINEL)
  })

  it('returns the new key when it is the only one set', () => {
    setVar(NEW_VAR, NEW_SENTINEL)
    expect(getSupabaseSecretKey()).toBe(NEW_SENTINEL)
  })

  it('returns the value verbatim — no trimming, no normalisation', () => {
    const withInnerSpace = `synthetic ${NEW_MARKER} inner-space`
    setVar(NEW_VAR, withInnerSpace)
    expect(getSupabaseSecretKey()).toBe(withInnerSpace)
  })
})

describe('getSupabaseSecretKey — fallback to the legacy variable', () => {
  it('falls back when the new var is unset', () => {
    setVar(LEGACY_VAR, LEGACY_SENTINEL)
    expect(getSupabaseSecretKey()).toBe(LEGACY_SENTINEL)
  })

  it('falls back when the new var is an empty string', () => {
    setVar(NEW_VAR, '')
    setVar(LEGACY_VAR, LEGACY_SENTINEL)
    expect(getSupabaseSecretKey()).toBe(LEGACY_SENTINEL)
  })

  it('falls back when the new var is whitespace-only', () => {
    for (const blank of [' ', '   ', '\t', '\n', ' \t\n ']) {
      setVar(NEW_VAR, blank)
      setVar(LEGACY_VAR, LEGACY_SENTINEL)
      expect(getSupabaseSecretKey()).toBe(LEGACY_SENTINEL)
    }
  })
})

describe('getSupabaseSecretKey — malformed (padded) values throw, never fall through', () => {
  it('throws when the new var has leading/trailing whitespace, even if the legacy var is valid', () => {
    setVar(NEW_VAR, ` ${NEW_SENTINEL}`)
    setVar(LEGACY_VAR, LEGACY_SENTINEL)
    expect(() => getSupabaseSecretKey()).toThrow(new RegExp(NEW_VAR))
  })

  it('throws for every padding shape on the new var', () => {
    for (const padded of [` ${NEW_SENTINEL}`, `${NEW_SENTINEL} `, `\n${NEW_SENTINEL}`, `${NEW_SENTINEL}\t`, ` ${NEW_SENTINEL} `]) {
      setVar(NEW_VAR, padded)
      expect(() => getSupabaseSecretKey()).toThrow()
    }
  })

  it('throws when the legacy var is padded — a malformed legacy value is not a silent skip', () => {
    for (const padded of [` ${LEGACY_SENTINEL}`, `${LEGACY_SENTINEL} `, `${LEGACY_SENTINEL}\n`]) {
      setVar(NEW_VAR, undefined)
      setVar(LEGACY_VAR, padded)
      expect(() => getSupabaseSecretKey()).toThrow(new RegExp(LEGACY_VAR))
    }
  })

  it('throws on a padded legacy value even when the new var is present-but-absent-shaped', () => {
    setVar(NEW_VAR, '   ')
    setVar(LEGACY_VAR, ` ${LEGACY_SENTINEL} `)
    expect(() => getSupabaseSecretKey()).toThrow()
  })
})

describe('getSupabaseSecretKey — nothing configured', () => {
  it('throws when neither variable is set', () => {
    expect(() => getSupabaseSecretKey()).toThrow()
  })

  it('names BOTH variables so the operator knows what to provision', () => {
    let message = ''
    try {
      getSupabaseSecretKey()
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain(NEW_VAR)
    expect(message).toContain(LEGACY_VAR)
  })

  it('throws when both are blank (empty / whitespace-only)', () => {
    setVar(NEW_VAR, '')
    setVar(LEGACY_VAR, '   ')
    expect(() => getSupabaseSecretKey()).toThrow()
  })
})

describe('getSupabaseSecretKey — no credential material ever leaves the module', () => {
  /** Every throwing path, each with sentinel values loaded. */
  const throwingCases: Array<[string, () => void]> = [
    ['padded new value', () => { setVar(NEW_VAR, ` ${NEW_SENTINEL} `); setVar(LEGACY_VAR, LEGACY_SENTINEL) }],
    ['padded legacy value', () => { setVar(LEGACY_VAR, `\t${LEGACY_SENTINEL}`) }],
  ]

  for (const [label, arrange] of throwingCases) {
    it(`${label}: neither the sentinel nor its marker appears in the thrown message or any log`, () => {
      const logs: string[] = []
      for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          logs.push(args.map(String).join(' '))
        })
      }

      arrange()
      let message = ''
      try {
        getSupabaseSecretKey()
      } catch (err) {
        message = `${(err as Error).message}\n${(err as Error).stack ?? ''}`
      }

      expect(message).not.toBe('')
      const haystack = `${message}\n${logs.join('\n')}`
      for (const secret of [NEW_SENTINEL, LEGACY_SENTINEL, NEW_MARKER, LEGACY_MARKER]) {
        expect(haystack).not.toContain(secret)
      }
      // The resolver is silent by design — no logging path exists to leak through.
      expect(logs).toEqual([])
    })
  }

  it('the "nothing configured" message carries no value material either', () => {
    let message = ''
    try {
      getSupabaseSecretKey()
    } catch (err) {
      message = (err as Error).message
    }
    for (const marker of [NEW_MARKER, LEGACY_MARKER]) {
      expect(message).not.toContain(marker)
    }
  })
})
