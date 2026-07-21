/**
 * Supabase secret-key resolver — the ONE place in this repo that reads the Supabase
 * service credential from the environment (decision #199 remediation).
 *
 * WHY THIS EXISTS
 * Supabase's modern `sb_secret_` keys are not JWTs, and the legacy `service_role` JWT is
 * being rotated out. Routing every consumer through one resolver makes that rotation a pure
 * value swap in the credential stores — no code change, no deploy, in the rotation window:
 *
 *   1. provision the new variable alongside the legacy one  -> new value is preferred here;
 *   2. remove the legacy variable                            -> new-only operation;
 *   3. disable the legacy key at the Supabase source.
 *
 * CONTRACT (exact, evaluated in order)
 *   • Preferred variable, then legacy variable, each under the identical rule:
 *       unset / empty / whitespace-only -> treated as ABSENT, fall through;
 *       non-blank but padded with leading or trailing whitespace -> THROW (malformed).
 *         A padded value is an operator paste error. Trimming it would silently authenticate
 *         with a credential nobody intended; falling through would silently prefer the other
 *         store. Both are worse than failing loudly at startup.
 *       clean non-blank -> return VERBATIM (no trimming, no normalisation).
 *   • Neither present -> THROW naming both variables.
 *
 * ⚠ NEVER include any part of a resolved value — not a prefix, suffix, or length — in a
 * thrown message, a comment, or a log line. This module deliberately performs no logging.
 *
 * ⚠ The two `process.env.<NAME>` reads below are literal dot accesses on purpose. Bundlers
 * (Next.js/webpack) can only statically substitute environment reads written that way; a
 * dynamic `process.env[name]` lookup would silently resolve to undefined wherever such
 * substitution is in effect. The variable NAMES are kept as separate constants purely so the
 * error messages can name them without a second literal.
 *
 * Imported by server-side app code AND by `tsx`-run scripts, so it must stay dependency-free
 * and must not be marked `server-only`.
 */

const PREFERRED_VAR = 'SUPABASE_SECRET_KEY'
const LEGACY_VAR = 'SUPABASE_SERVICE_ROLE_KEY'

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
 * Resolves the Supabase service credential.
 *
 * @throws if a configured value is malformed, or if no credential is configured at all.
 *         Callers do not catch this: a server process without a service credential must
 *         fail loudly rather than degrade to unauthenticated reads.
 */
export function getSupabaseSecretKey(): string {
  const preferred = classify(PREFERRED_VAR, process.env.SUPABASE_SECRET_KEY)
  if (preferred !== null) return preferred

  const legacy = classify(LEGACY_VAR, process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (legacy !== null) return legacy

  throw new Error(
    `No Supabase service credential is configured. Set ${PREFERRED_VAR} (preferred), or the ` +
      `deprecated ${LEGACY_VAR} as a fallback, in this environment.`,
  )
}
