/**
 * Supabase publishable-key resolver — the ONE place in this repo that reads the Supabase
 * PUBLIC client credential from the environment (publishable-key compatibility layer).
 *
 * ⚠ SENSITIVITY DIVERGENCE FROM src/lib/supabase/secret-key.ts — READ THIS FIRST.
 * The credential resolved here is PUBLIC BY DESIGN. It is statically inlined into the client
 * bundle, shipped to every browser that loads the app, and visible in DevTools. Its authority is
 * bounded entirely by RLS and the grant layer, not by concealment. That is the intended contract
 * for a publishable key, not a leak.
 *
 * So the invariant this module protects is NOT value secrecy — it has none to protect. It is:
 *
 *   1. FAIL-CLOSED ON ABSENCE. The three consumers previously did `process.env.<NAME>!`, whose
 *      non-null assertion turns a missing or blank value into an undefined key handed to the SDK
 *      and a confusing downstream auth failure. Resolving here throws at the read site, naming the
 *      variables, so a misconfigured environment fails where it can be diagnosed.
 *
 *   2. STATIC-SUBSTITUTION SAFETY. See the dot-access note below — this is the property most
 *      likely to be broken by a well-meaning future refactor.
 *
 * A future reader must NOT mistake this module for a secret-handling one and must not copy
 * secret-key.ts's protections here as though they were required, nor relax secret-key.ts's
 * protections to match this file. secret-key.ts exists to keep a value SECRET; this file exists to
 * keep resolution CORRECT and FAIL-CLOSED. The two files look alike and mean different things.
 *
 * CONTRACT (exact, evaluated in order) — identical in shape to secret-key.ts, deliberately:
 *   • Preferred variable, then legacy variable, each under the identical rule:
 *       unset / empty / whitespace-only -> treated as ABSENT, fall through;
 *       non-blank but padded with leading or trailing whitespace -> THROW (malformed).
 *         A padded value is an operator paste error. Trimming it would silently authenticate with
 *         a credential nobody intended; falling through would silently prefer the other variable.
 *       clean non-blank -> return VERBATIM (no trimming, no normalisation).
 *   • Neither present -> THROW naming both variables.
 *
 * ⚠ THE TWO ENVIRONMENT READS BELOW MUST STAY LITERAL DOT ACCESSES. This is load-bearing here in a
 * way it is not for a server-only resolver. Next.js/webpack substitutes `NEXT_PUBLIC_`-prefixed
 * reads at BUILD TIME, and it can only do so for a literal `process.env.NAME` expression. A
 * computed `process.env[name]` lookup is not substituted, so in the browser bundle — and in edge
 * middleware — it resolves to `undefined`. The failure mode is the nastiest kind: the preferred
 * branch silently never fires, the fallback silently always wins, and every deterministic test
 * that runs under Node still passes. Never convert these to a loop, a table, or a helper that
 * takes the name as a parameter.
 *
 * ⚠ Because the values are build-time inlined, changing either variable in a deployment context
 * has NO effect on an existing deploy. Every environment change requires a fresh deploy in EVERY
 * affected context, confirmed `ready` with `commit_ref` matched to the intended SHA.
 *
 * The variable NAMES are module-private. Unlike secret-key.ts, that is a consistency choice rather
 * than a security control — there is no secret to launder — but keeping one read site is what
 * makes the eventual legacy-variable removal a single-file edit.
 *
 * No `assertNotPublishableVarName` guard is provided, deliberately: secret-key.ts needs one
 * because a generic env reader could otherwise fetch a SECRET without naming it. Nothing here is
 * confidential, no consumer needs such a guard, and speculative guard machinery would imply a
 * confidentiality property this credential does not have.
 *
 * Imported by browser code, server code, and edge middleware, so it must stay dependency-free and
 * must NOT be marked `server-only`.
 */

const PREFERRED_VAR = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
const LEGACY_VAR = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'

/**
 * Applies the absent/malformed/clean rule to one raw environment value.
 * @returns the clean value, or `null` when the variable is absent for our purposes.
 * @throws when the value is non-blank but padded. The message names the VARIABLE, never the value.
 */
function classify(name: string, raw: string | undefined): string | null {
  if (raw === undefined) return null
  if (raw.trim() === '') return null
  if (raw.trim() !== raw) {
    throw new Error(
      `${name} is set but has leading or trailing whitespace. Re-set it with no surrounding ` +
        'whitespace — it is not trimmed automatically, because silently authenticating with an ' +
        'unintended credential is worse than failing to start.',
    )
  }
  return raw
}

/**
 * Resolves the Supabase publishable (public client) credential.
 *
 * @throws if a configured value is malformed, or if no credential is configured at all.
 *         Callers do not catch this: a client that cannot identify its project must fail loudly
 *         rather than construct a Supabase client with an undefined key.
 */
export function getSupabasePublishableKey(): string {
  const preferred = classify(
    PREFERRED_VAR,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
  if (preferred !== null) return preferred

  const legacy = classify(
    LEGACY_VAR,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  if (legacy !== null) return legacy

  throw new Error(
    `No Supabase publishable credential is configured. Set ${PREFERRED_VAR} (preferred), or the ` +
      `deprecated ${LEGACY_VAR} as a fallback, in this environment.`,
  )
}
