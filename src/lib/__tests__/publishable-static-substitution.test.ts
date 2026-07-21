import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { transformSync } from 'esbuild'

// Allowlisted declaration lines — see publishable-read-sites.test.ts branch (e).
const APP_PREFERRED_VAR = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
const APP_LEGACY_VAR = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'

/**
 * BUILD-TIME STATIC SUBSTITUTION — the property most likely to be silently broken.
 *
 * Next.js/webpack replaces `NEXT_PUBLIC_`-prefixed environment reads at BUILD time, and can only
 * do so for a LITERAL `process.env.NAME` member expression. If someone "cleans up" the resolver
 * into a loop, a lookup table, or a helper taking the name as a parameter, the read is no longer
 * substitutable: in the browser bundle and in edge middleware it resolves to `undefined`, the
 * preferred branch silently never fires, the fallback silently always wins — and every Node-based
 * unit test still passes, because under Node `process.env` is real. That combination is why this
 * needs its own assertion rather than being left to the resolver's unit tests.
 *
 * HOW THIS PROVES IT. The resolver's real source is run through a define-based substituter with
 * SYNTHETIC sentinel values bound to the two reads. If the reads are in substitutable form the
 * sentinels appear in the output; if they have been refactored into a computed lookup they do not.
 * A negative control asserts the substituter genuinely fails on the parameterised shape, so a pass
 * here cannot come from a substituter that rewrites everything.
 *
 * ⚠ NO REAL VALUE IS EVER INVOLVED. The sentinels are synthetic and defined by this test; the real
 * environment is never read, printed, hashed, or embedded. This test would behave identically on a
 * machine with no Supabase configuration at all.
 *
 * esbuild is used as the substituter because it implements the same define semantics for literal
 * member expressions and is already present in the toolchain. It is a modelling stand-in for the
 * production bundler, not the production bundler itself — the negative control is what makes the
 * model's verdict meaningful.
 */

const APP_RESOLVER = 'src/lib/supabase/publishable-key.ts'
const CONSUMERS = ['src/lib/supabase/client.ts', 'src/lib/supabase/server.ts', 'src/middleware.ts']

const PREFERRED_SENTINEL = 'QX7ZSUBSTPREFERRED0000'
const LEGACY_SENTINEL = 'QX7ZSUBSTLEGACY0000'

const DEFINE: Record<string, string> = {
  [`process.env.${APP_PREFERRED_VAR}`]: JSON.stringify(PREFERRED_SENTINEL),
  [`process.env.${APP_LEGACY_VAR}`]: JSON.stringify(LEGACY_SENTINEL),
}

function substitute(source: string): string {
  return transformSync(source, { loader: 'ts', define: DEFINE }).code
}

const resolverSource = () => readFileSync(join(process.cwd(), APP_RESOLVER), 'utf8')
const sourceOf = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')

/** Strip comments before a STRUCTURAL check, so documentation may discuss forbidden shapes. */
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('the publishable resolver survives build-time static substitution', () => {
  it('BOTH reads are substituted — the preferred branch is reachable in a bundle', () => {
    const out = substitute(resolverSource())
    expect(out).toContain(PREFERRED_SENTINEL)
    expect(out).toContain(LEGACY_SENTINEL)
  })

  it('no un-substituted process.env read of either variable survives in the output', () => {
    // If a read were left in computed form, the identifier would still be present as a string.
    const out = substitute(resolverSource())
    expect(out).not.toContain(`process.env.${APP_PREFERRED_VAR}`)
    expect(out).not.toContain(`process.env.${APP_LEGACY_VAR}`)
  })

  it('NEGATIVE CONTROL — a parameterised read is NOT substituted (the model is not vacuous)', () => {
    // This is the exact refactor the resolver's docblock forbids. If this snippet were also
    // "substituted", the positive assertions above would prove nothing.
    const refactored = `
      function read(name: string): string | undefined { return process.env[name] }
      export const preferred = read('${APP_PREFERRED_VAR}')
      export const legacy = read('${APP_LEGACY_VAR}')
    `
    const out = substitute(refactored)
    expect(out).not.toContain(PREFERRED_SENTINEL)
    expect(out).not.toContain(LEGACY_SENTINEL)
  })

  it('the resolver performs NO computed env access and does not alias process.env', () => {
    const src = codeOnly(resolverSource())
    expect(/process\.env\s*\[/.test(src), 'resolver performs computed process.env access').toBe(false)
    expect(/=\s*process\.env\s*(?:[;,)]|$)/m.test(src), 'resolver aliases process.env').toBe(false)
    // Positive control: the two literal member reads really are present.
    expect(src).toContain(`process.env.${APP_PREFERRED_VAR}`)
    expect(src).toContain(`process.env.${APP_LEGACY_VAR}`)
  })
})

describe('every application consumer goes through the resolver', () => {
  for (const file of CONSUMERS) {
    it(`${file} imports getSupabasePublishableKey and reads no credential variable directly`, () => {
      const src = sourceOf(file)
      expect(src).toMatch(
        /import\s*\{[^}]*getSupabasePublishableKey[^}]*\}\s*from\s*['"][^'"]*publishable-key['"]/,
      )
      expect(src).toContain('getSupabasePublishableKey()')
      // The whole point of the migration: the identifier no longer appears in the consumer at all.
      expect(src).not.toContain(APP_PREFERRED_VAR)
      expect(src).not.toContain(APP_LEGACY_VAR)
    })
  }

  it('no consumer retains a non-null-asserted credential read (the old fail-open shape)', () => {
    // `process.env.<NAME>!` turned a missing value into an undefined key handed to the SDK.
    for (const file of CONSUMERS) {
      const src = codeOnly(sourceOf(file))
      expect(/process\.env\.[A-Z0-9_]*(?:ANON|PUBLISHABLE)[A-Z0-9_]*\s*!/.test(src)).toBe(false)
    }
  })
})
