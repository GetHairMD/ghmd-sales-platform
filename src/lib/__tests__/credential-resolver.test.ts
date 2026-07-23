import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertNotCredentialVarName, getSupabaseSecretKey } from '../supabase/secret-key'

// Allowlisted declaration lines — see credential-read-sites.test.ts branch (e).
const NEW_VAR = 'SUPABASE_SECRET_KEY'
const LEGACY_VAR = 'SUPABASE_SERVICE_ROLE_KEY'

/**
 * Supabase secret-key resolver — decision #199, preferred-only.
 *
 * The resolver is the ONE place in the repo that reads the Supabase service credential. With the
 * legacy fallback removed from this resolver, it reads the modern `sb_secret_` key ONLY; provider-
 * level deactivation of the legacy key remains a separate pending step under decision #199. The
 * retired name survives solely as a permanently-refused identifier (`assertNotCredentialVarName`),
 * never as a read.
 *
 * ⚠ Env changes still require a fresh deploy in EVERY affected context — env vars are captured per
 * deploy and service clients are process-cached — each confirmed `ready` with its `commit_ref`
 * matched to the intended SHA before it is verified against.
 *
 * Contract under test (exact):
 *   1. preferred var: absent / empty / whitespace-only -> THROW (fail closed, no fallback);
 *      padded non-blank -> THROW; clean -> return verbatim.
 *   2. the retired var is IGNORED — setting it never rescues resolution.
 *   3. assertNotCredentialVarName refuses BOTH the current and the retired name.
 *
 * ⚠ The variable NAMES are module-PRIVATE in the resolver — it exports no name, only the
 * `assertNotCredentialVarName` predicate, which can refuse a name but cannot hand one out. This
 * suite therefore declares the two credential-name LITERALS itself, on the two branch-(e)
 * allowlisted declaration lines at the top of this file; every other line uses those constants.
 *
 * ⚠ Env is manipulated ONLY through `vi.stubEnv`. This suite performs no `process.env[NAME]` read of
 * either credential — the framework owns save/restore.
 */

const NEW_MARKER = 'QX7ZNEWMARKER'
const LEGACY_MARKER = 'QX7ZLEGACYMARKER'
const NEW_SENTINEL = `synthetic-not-a-real-key-${NEW_MARKER}-0000`
const LEGACY_SENTINEL = `synthetic-not-a-real-key-${LEGACY_MARKER}-0000`

/** Set (or, with `undefined`, unset) a variable for the current test only. */
function setVar(name: string, value: string | undefined): void {
  vi.stubEnv(name, value)
}

beforeEach(() => {
  setVar(NEW_VAR, undefined)
  setVar(LEGACY_VAR, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('getSupabaseSecretKey — preferred-only resolution', () => {
  it('returns the modern key when it is set', () => {
    setVar(NEW_VAR, NEW_SENTINEL)
    expect(getSupabaseSecretKey()).toBe(NEW_SENTINEL)
  })

  it('returns the value verbatim — no trimming, no normalisation', () => {
    const withInnerSpace = `synthetic ${NEW_MARKER} inner-space`
    setVar(NEW_VAR, withInnerSpace)
    expect(getSupabaseSecretKey()).toBe(withInnerSpace)
  })

  it('ignores the modern key regardless of whether the retired var is set', () => {
    setVar(NEW_VAR, NEW_SENTINEL)
    setVar(LEGACY_VAR, LEGACY_SENTINEL)
    // The retired value must never be selected, and its presence must not change the result.
    expect(getSupabaseSecretKey()).toBe(NEW_SENTINEL)
  })
})

describe('getSupabaseSecretKey — the legacy fallback is GONE (reintroduction regression)', () => {
  it('THROWS when only the retired var is set — it does NOT fall back to it', () => {
    setVar(LEGACY_VAR, LEGACY_SENTINEL)
    expect(() => getSupabaseSecretKey()).toThrow()
    // …and the retired value never leaks into the failure.
    let message = ''
    try {
      getSupabaseSecretKey()
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).not.toContain(LEGACY_SENTINEL)
    expect(message).not.toContain(LEGACY_MARKER)
  })

  it('THROWS when the modern var is empty even though the retired var is valid', () => {
    setVar(NEW_VAR, '')
    setVar(LEGACY_VAR, LEGACY_SENTINEL)
    expect(() => getSupabaseSecretKey()).toThrow()
  })

  it('THROWS when the modern var is whitespace-only even though the retired var is valid', () => {
    for (const blank of [' ', '   ', '\t', '\n', ' \t\n ']) {
      setVar(NEW_VAR, blank)
      setVar(LEGACY_VAR, LEGACY_SENTINEL)
      expect(() => getSupabaseSecretKey()).toThrow()
    }
  })
})

describe('getSupabaseSecretKey — malformed (padded) modern value throws', () => {
  it('throws when the modern var has leading/trailing whitespace', () => {
    setVar(NEW_VAR, ` ${NEW_SENTINEL}`)
    expect(() => getSupabaseSecretKey()).toThrow(new RegExp(NEW_VAR))
  })

  it('throws for every padding shape on the modern var', () => {
    for (const padded of [` ${NEW_SENTINEL}`, `${NEW_SENTINEL} `, `\n${NEW_SENTINEL}`, `${NEW_SENTINEL}\t`, ` ${NEW_SENTINEL} `]) {
      setVar(NEW_VAR, padded)
      expect(() => getSupabaseSecretKey()).toThrow()
    }
  })
})

describe('getSupabaseSecretKey — nothing configured', () => {
  it('throws when the modern variable is not set', () => {
    expect(() => getSupabaseSecretKey()).toThrow()
  })

  it('names the preferred variable so the operator knows what to provision', () => {
    let message = ''
    try {
      getSupabaseSecretKey()
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain(NEW_VAR)
  })

  it('the missing-credential message names ONLY the preferred variable, not the retired one', () => {
    let message = ''
    try {
      getSupabaseSecretKey()
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).not.toContain(LEGACY_VAR)
  })

  it('throws when the modern var is blank (empty / whitespace-only)', () => {
    for (const blank of ['', '   ']) {
      setVar(NEW_VAR, blank)
      expect(() => getSupabaseSecretKey()).toThrow()
    }
  })
})

describe('assertNotCredentialVarName — permanent defence-in-depth refusal', () => {
  it('refuses BOTH the current and the retired service-credential name', () => {
    for (const name of [NEW_VAR, LEGACY_VAR]) {
      expect(() => assertNotCredentialVarName(name)).toThrow(/getSupabaseSecretKey/)
    }
  })

  it('returns (does not throw) for an unrelated variable name', () => {
    expect(() => assertNotCredentialVarName('SOME_UNRELATED_VAR')).not.toThrow()
  })

  it('reveals nothing — the refusal message names the passed variable but no value', () => {
    let message = ''
    try {
      assertNotCredentialVarName(LEGACY_VAR)
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain(LEGACY_VAR)
    expect(message).not.toContain(LEGACY_MARKER)
  })
})

describe('getSupabaseSecretKey — no credential material ever leaves the module', () => {
  /** Every throwing path, each with sentinel values loaded. */
  const throwingCases: Array<[string, () => void]> = [
    ['padded modern value', () => { setVar(NEW_VAR, ` ${NEW_SENTINEL} `) }],
    ['only the retired var set (no fallback)', () => { setVar(LEGACY_VAR, LEGACY_SENTINEL) }],
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
